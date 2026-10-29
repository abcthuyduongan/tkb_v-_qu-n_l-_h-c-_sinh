-- Sau SQL14/module36. Thong nhat khoa ngay, thu hoi co lich su va bao cao tiet ca nhan; khong xoa du lieu.
BEGIN;

-- SOURCE 37_v6_review_corrections.sql
-- Same-day correction guard: an observation UPDATE follows the same lesson
-- ownership/day/manual-close rules as a new observation, attendance and review.
-- Apply after36. No cancellation schema or report semantics are added here.

DO $guard$ BEGIN
 IF to_regprocedure('public.v4_save_seating_rotation(text,text,jsonb,integer,timestamptz)') IS NULL
 OR to_regprocedure('public.v4_check_lesson_writable(uuid)') IS NULL THEN
  RAISE EXCEPTION 'Cần hoàn tất cập nhật36 trước khi thống nhất quyền sửa nhận xét';
 END IF;
END $guard$;

CREATE OR REPLACE FUNCTION public.v4_same_day_observation_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='UPDATE' AND (OLD.observed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date<>public.v4_school_today() THEN
  RAISE EXCEPTION 'Ghi nhận ngày trước đã khóa, chỉ được xem lại';
 END IF;
 IF (NEW.observed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date<>public.v4_school_today() THEN
  RAISE EXCEPTION 'Không được ghi nhận lùi ngày hoặc trước ngày';
 END IF;
 IF NEW.session_id IS NOT NULL THEN
  -- UPDATE used to check only the date. A legacy manually closed session
  -- must not remain editable through the note-update route.
  IF NOT public.v4_check_lesson_writable(NEW.session_id) THEN
   RAISE EXCEPTION 'Tiết đã khóa, kết thúc hoặc không thuộc giáo viên này';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.v4_sessions x WHERE x.id=NEW.session_id AND x.lesson_date=public.v4_school_today()) THEN
   RAISE EXCEPTION 'Tiết ngày trước đã khóa, chỉ được xem lại';
  END IF;
 END IF;
 RETURN NEW;
END $$;
-- Existing named trigger continues to use this function. Outside-lesson
-- observations and today's follow-up actions retain their existing policies.
NOTIFY pgrst,'reload schema';

-- SOURCE 38_v6_observation_withdrawal.sql
-- Withdraw a mistaken observation without deleting its original facts/history.
-- Apply after37. Additive nullable state only; existing effective rows are unchanged.

DO $guard$ BEGIN
 IF to_regprocedure('public.v4_save_seating_rotation(text,text,jsonb,integer,timestamptz)') IS NULL
 OR position('IF NOT public.v4_check_lesson_writable' in pg_get_functiondef(to_regprocedure('public.v4_same_day_observation_guard()')))=0 THEN
  RAISE EXCEPTION 'Cần hoàn tất cập nhật37 trước khi thêm thu hồi ghi nhận';
 END IF;
END $guard$;
ALTER TABLE public.v4_observations ADD COLUMN IF NOT EXISTS withdrawn_at timestamptz;
ALTER TABLE public.v4_observations ADD COLUMN IF NOT EXISTS withdrawn_by uuid REFERENCES auth.users(id);
ALTER TABLE public.v4_observations ADD COLUMN IF NOT EXISTS withdrawal_reason text;
ALTER TABLE public.v4_observations DROP CONSTRAINT IF EXISTS v4_observation_withdrawal_valid;
ALTER TABLE public.v4_observations ADD CONSTRAINT v4_observation_withdrawal_valid CHECK(
 (withdrawn_at IS NULL AND withdrawn_by IS NULL AND withdrawal_reason IS NULL)
 OR (withdrawn_at IS NOT NULL AND withdrawn_by IS NOT NULL AND withdrawn_by=created_by AND withdrawal_reason IS NOT NULL
  AND char_length(btrim(withdrawal_reason)) BETWEEN 3 AND 600)
);
-- Ordinary clients still edit notes, never withdrawal metadata, author/identity
-- or classification fields. The existing trigger owns edited_at/audit capture.
REVOKE UPDATE ON public.v4_observations FROM authenticated;
GRANT UPDATE(note) ON public.v4_observations TO authenticated;
DROP POLICY IF EXISTS v4_obs_effective ON public.v4_observations;
CREATE POLICY v4_obs_effective ON public.v4_observations AS RESTRICTIVE FOR ALL TO authenticated
 USING(withdrawn_at IS NULL) WITH CHECK(withdrawn_at IS NULL);

CREATE OR REPLACE FUNCTION public.v4_withdraw_observation(obs uuid,reason text,expected_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE prior public.v4_observations; saved public.v4_observations; content text:=btrim(reason);
BEGIN
 IF NOT public.v4_credentials_ready() THEN RAISE EXCEPTION 'Cần đăng nhập để thu hồi ghi nhận'; END IF;
 IF content IS NULL OR char_length(content) NOT BETWEEN 3 AND 600 OR expected_at IS NULL THEN
  RAISE EXCEPTION 'Nhập lý do thu hồi từ 3 đến 600 ký tự và tải lại ghi nhận trước khi sửa';
 END IF;
 SELECT * INTO prior FROM public.v4_observations o WHERE o.id=obs FOR UPDATE;
 IF NOT FOUND OR prior.created_by<>auth.uid() OR NOT public.v4_actual_class_access(prior.school_year,prior.class_code)
  OR (prior.category='health' AND NOT public.v4_health_access(prior.school_year,prior.class_code)) THEN
  RAISE EXCEPTION 'Không có quyền thu hồi ghi nhận này';
 END IF;
 IF (prior.observed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date<>public.v4_school_today()
 OR (prior.session_id IS NOT NULL AND NOT public.v4_check_lesson_writable(prior.session_id)) THEN
  RAISE EXCEPTION 'Ghi nhận hoặc tiết đã khóa, chỉ được xem lại';
 END IF;
 -- A lost reply may retry the same intended result without a second UPDATE/audit.
 IF prior.withdrawn_at IS NOT NULL THEN
  IF prior.withdrawal_reason=content AND prior.withdrawn_by=auth.uid() THEN RETURN to_jsonb(prior); END IF;
  RAISE EXCEPTION 'Ghi nhận đã được thu hồi. Tải lại để xem lịch sử';
 END IF;
 IF coalesce(prior.edited_at,prior.observed_at) IS DISTINCT FROM expected_at THEN
  RAISE EXCEPTION 'Ghi nhận đã thay đổi. Tải lại trước khi thu hồi';
 END IF;
 UPDATE public.v4_observations SET withdrawn_at=statement_timestamp(),withdrawn_by=auth.uid(),withdrawal_reason=content
 WHERE id=obs RETURNING * INTO saved;
 RETURN to_jsonb(saved);
END $$;

CREATE OR REPLACE FUNCTION public.v4_withdrawn_observations(sess uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE lesson public.v4_sessions; home_access boolean;
BEGIN
 IF NOT public.v4_credentials_ready() THEN RAISE EXCEPTION 'Cần đăng nhập để xem lịch sử thu hồi'; END IF;
 SELECT * INTO lesson FROM public.v4_sessions WHERE id=sess;
 IF NOT FOUND OR NOT public.v4_actual_class_access(lesson.school_year,lesson.class_code) THEN
  RAISE EXCEPTION 'Không có quyền xem lịch sử thu hồi của tiết';
 END IF;
 home_access:=public.v4_actual_homeroom(lesson.school_year,lesson.class_code);
 IF lesson.teacher_id<>auth.uid() AND NOT home_access THEN
  RAISE EXCEPTION 'Chỉ giáo viên của tiết hoặc GVCN được xem lịch sử thu hồi';
 END IF;
 RETURN coalesce((SELECT jsonb_agg(to_jsonb(o) ORDER BY o.withdrawn_at DESC,o.id)
  FROM public.v4_observations o WHERE o.session_id=sess AND o.withdrawn_at IS NOT NULL
  AND (o.created_by=auth.uid() OR home_access)
  AND (o.category<>'health' OR public.v4_health_access(o.school_year,o.class_code))),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.v4_withdraw_observation(uuid,text,timestamptz),public.v4_withdrawn_observations(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.v4_withdraw_observation(uuid,text,timestamptz),public.v4_withdrawn_observations(uuid) TO authenticated;

-- Alert history remains readable under existing rules; withdrawn reminders
-- cannot receive new follow-up actions or re-enter effective alert lists.
CREATE OR REPLACE FUNCTION public.v4_can_manage_alert(ob uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM public.v4_observations o
  WHERE o.id=ob AND o.withdrawn_at IS NULL AND o.is_alert=true
   AND public.v4_health_access(o.school_year,o.class_code))
$$;
REVOKE ALL ON FUNCTION public.v4_can_manage_alert(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.v4_can_manage_alert(uuid) TO authenticated;

-- Invoker reports/daily/handoff and normal REST reads honor the restrictive
-- effective policy above. These two definer consumers need an explicit filter.
CREATE OR REPLACE FUNCTION public.v4_school_report(
 y text,c text,d1 date,d2 date,range_kind text DEFAULT 'week',include_details boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE cls text:=nullif(btrim(c),''); admin_access boolean; home_access boolean; aggregate_access boolean;
 detail_count bigint; result jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Cần đăng nhập để xem báo cáo'; END IF;
 IF NOT public.v4_credentials_ready() THEN RAISE EXCEPTION 'Cần đổi mật khẩu trước khi xem dữ liệu lớp'; END IF;
 IF y IS NULL OR y !~ '^[0-9]{4}-[0-9]{4}$' OR split_part(y,'-',2)::integer<>split_part(y,'-',1)::integer+1 THEN
  RAISE EXCEPTION 'Năm học không hợp lệ';
 END IF;
 IF d1 IS NULL OR d2 IS NULL OR d2<d1 OR d2-d1>369 THEN
  RAISE EXCEPTION 'Khoảng báo cáo phải từ 1 đến 370 ngày';
 END IF;
 IF range_kind IS NULL OR range_kind NOT IN('week','month','semester','custom') OR include_details IS NULL THEN
  RAISE EXCEPTION 'Loại báo cáo không hợp lệ';
 END IF;
 IF NOT public.v4_school_report_access() THEN RAISE EXCEPTION 'Không có quyền Ban Giám Hiệu'; END IF;
 admin_access:=true;
 home_access:=false;
 aggregate_access:=admin_access OR home_access;

 IF NOT admin_access AND (cls IS NULL OR NOT public.v4_actual_class_access(y,cls)) THEN
  RAISE EXCEPTION 'Không có quyền xem báo cáo lớp này';
 END IF;
 IF NOT admin_access AND NOT home_access AND range_kind<>'week' THEN
  RAISE EXCEPTION 'Giáo viên bộ môn chỉ xem đánh giá theo tuần';
 END IF;
 IF range_kind='week' AND (d2-d1>6 OR date_trunc('week',d1::timestamp)<>date_trunc('week',d2::timestamp)) THEN
  RAISE EXCEPTION 'Chọn các ngày trong cùng một tuần từ thứ Hai đến Chủ nhật';
 ELSIF range_kind='month' AND date_trunc('month',d1::timestamp)<>date_trunc('month',d2::timestamp) THEN
  RAISE EXCEPTION 'Chọn các ngày trong cùng một tháng';
 ELSIF range_kind='semester' AND d2-d1>219 THEN
  RAISE EXCEPTION 'Khoảng học kỳ tối đa 220 ngày; chọn mốc thực tế của trường';
 ELSIF range_kind='custom' AND NOT admin_access THEN
  RAISE EXCEPTION 'Khoảng tùy chọn chỉ dành cho quản trị';
 END IF;
 IF NOT aggregate_access AND d2>date_trunc('week',public.v4_school_today()::timestamp)::date+6 THEN
  RAISE EXCEPTION 'Chỉ xem được tuần hiện tại hoặc các tuần trước';
 END IF;
 -- Never silently truncate an export. Aggregated reports remain available for
 -- a whole school year; request a shorter range/class for very large details.
 IF include_details THEN
  SELECT
   (SELECT count(*) FROM public.v4_attendance a JOIN public.v4_sessions s ON s.id=a.session_id
    WHERE s.school_year=y AND (cls IS NULL OR s.class_code=cls) AND s.lesson_date BETWEEN d1 AND d2)
   +(SELECT count(*) FROM public.v4_observations o LEFT JOIN public.v4_sessions s ON s.id=o.session_id
     WHERE o.withdrawn_at IS NULL AND o.category<>'health' AND o.school_year=y AND (cls IS NULL OR o.class_code=cls)
      AND coalesce(s.lesson_date,(o.observed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) BETWEEN d1 AND d2)
   +(SELECT count(*) FROM public.v4_support_logs l WHERE false AND l.school_year=y AND (cls IS NULL OR l.class_code=cls)
     AND (l.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN d1 AND d2)
  INTO detail_count;
  IF detail_count>200000 THEN RAISE EXCEPTION 'Báo cáo có hơn 200000 dòng chi tiết. Chọn một lớp hoặc khoảng ngắn hơn, hoặc xem tổng hợp.'; END IF;
 END IF;
 WITH
 roster AS MATERIALIZED (
  SELECT s.id,s.school_year,s.class_code,s.student_code,s.full_name,s.active FROM public.v4_students s
  WHERE s.school_year=y AND (cls IS NULL OR s.class_code=cls)
 ), lessons AS MATERIALIZED (
  SELECT s.id,s.school_year,s.class_code,s.lesson_date,s.period_no,s.subject,s.teacher_id,t.teacher_name,
   coalesce(s.ended_at,CASE WHEN s.scheduled_end_at<=statement_timestamp() THEN s.scheduled_end_at END) AS ended_at,
   s.scheduled_end_at,
   (s.ended_at IS NULL AND coalesce(s.scheduled_end_at<=statement_timestamp(),false)) AS is_auto_ended
  FROM public.v4_sessions s LEFT JOIN public.v4_teachers t ON t.user_id=s.teacher_id
  WHERE s.school_year=y AND (cls IS NULL OR s.class_code=cls) AND s.lesson_date BETWEEN d1 AND d2
 ), att AS MATERIALIZED (
  SELECT a.session_id,a.student_id,a.status,NULL::text AS note,a.updated_at FROM public.v4_attendance a JOIN lessons s ON s.id=a.session_id
 ), obs AS MATERIALIZED (
  SELECT o.id,o.student_id,o.school_year,o.class_code,o.session_id,o.observed_at,o.category,o.behavior_code,
   o.activity_context,o.note,o.is_alert,o.attention_kind,o.created_by,t.teacher_name,
   s.lesson_date,s.period_no,s.subject
  FROM public.v4_observations o LEFT JOIN public.v4_sessions s ON s.id=o.session_id
   LEFT JOIN public.v4_teachers t ON t.user_id=o.created_by
  WHERE o.withdrawn_at IS NULL AND o.category<>'health' AND o.school_year=y AND (cls IS NULL OR o.class_code=cls)
   AND coalesce(s.lesson_date,(o.observed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) BETWEEN d1 AND d2
 ), support AS MATERIALIZED (
  SELECT l.id,l.school_year,l.class_code,l.student_id,l.activity_type,l.content,l.follow_up_on,l.created_at,l.created_by
  FROM public.v4_support_logs l WHERE false AND l.school_year=y AND (cls IS NULL OR l.class_code=cls)
   AND (l.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN d1 AND d2
 ), class_lessons AS (
  SELECT class_code,count(*) AS total_sessions FROM lessons WHERE aggregate_access GROUP BY class_code
 ), student_att AS (
  SELECT student_id,count(*) AS confirmed,
   count(*) FILTER(WHERE status='present') AS present,count(*) FILTER(WHERE status='absent') AS absent,
   count(*) FILTER(WHERE status='late') AS late,count(*) FILTER(WHERE status='excused') AS excused
  FROM att WHERE aggregate_access GROUP BY student_id
 ), student_obs AS (
  SELECT student_id,count(*) FILTER(WHERE category='positive') AS positive,
   count(*) FILTER(WHERE category='concern') AS concern,count(*) FILTER(WHERE category='health') AS health
  FROM obs WHERE aggregate_access GROUP BY student_id
 ), lesson_att AS (
  SELECT session_id,count(*) AS attendance_confirmed,
   count(*) FILTER(WHERE status='present') AS present,count(*) FILTER(WHERE status='absent') AS absent,
   count(*) FILTER(WHERE status='late') AS late,count(*) FILTER(WHERE status='excused') AS excused
  FROM att GROUP BY session_id
 ), lesson_obs AS (
  SELECT session_id,count(*) FILTER(WHERE category='positive') AS positive,
   count(*) FILTER(WHERE category='concern') AS concern,count(*) FILTER(WHERE category='health') AS health
  FROM obs WHERE session_id IS NOT NULL GROUP BY session_id
 ), student_rows AS (
  SELECT s.*,coalesce(l.total_sessions,0) AS total_sessions,coalesce(a.confirmed,0) AS confirmed,
   coalesce(a.present,0) AS present,coalesce(a.absent,0) AS absent,coalesce(a.late,0) AS late,coalesce(a.excused,0) AS excused,
   NULL::bigint AS unrecorded,
   coalesce(o.positive,0) AS positive,coalesce(o.concern,0) AS concern,coalesce(o.health,0) AS health
  FROM roster s LEFT JOIN class_lessons l USING(class_code) LEFT JOIN student_att a ON a.student_id=s.id LEFT JOIN student_obs o ON o.student_id=s.id
  WHERE aggregate_access
 ), lesson_rows AS (
  SELECT s.*,coalesce(a.attendance_confirmed,0) AS attendance_confirmed,
   coalesce(a.present,0) AS present,coalesce(a.absent,0) AS absent,coalesce(a.late,0) AS late,coalesce(a.excused,0) AS excused,
   NULL::bigint AS unrecorded,
   coalesce(o.positive,0) AS positive,coalesce(o.concern,0) AS concern,coalesce(o.health,0) AS health
  FROM lessons s LEFT JOIN lesson_att a ON a.session_id=s.id LEFT JOIN lesson_obs o ON o.session_id=s.id
 ), class_codes AS (
  SELECT class_code FROM roster UNION SELECT class_code FROM lessons UNION SELECT class_code FROM obs
 )
 SELECT jsonb_build_object(
  'range',jsonb_build_object('school_year',y,'class_code',cls,'start',d1,'end',d2,'kind',range_kind),
  'details_included',include_details,
  'lesson_reviews','[]'::jsonb,
  'roster_basis','current_roster',
  'attendance_completeness','unknown_membership_history',
  'permissions',jsonb_build_object('admin',false,'homeroom',false,'aggregate',true,'export',false,'school_viewer',true,'health',false,'support',false),
  'classes',coalesce((SELECT jsonb_agg(jsonb_build_object('class_code',cc.class_code)
   || CASE WHEN aggregate_access THEN jsonb_build_object(
    'students',(SELECT count(*) FROM roster r WHERE r.class_code=cc.class_code AND r.active),
    'sessions',(SELECT count(*) FROM lessons s WHERE s.class_code=cc.class_code)) ELSE '{}'::jsonb END
   ORDER BY cc.class_code) FROM class_codes cc),'[]'::jsonb),
  'students',CASE WHEN aggregate_access THEN
   coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.class_code,r.student_code,r.id) FROM student_rows r),'[]'::jsonb)
   ELSE coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.class_code,r.student_code,r.id) FROM roster r),'[]'::jsonb) END,
  'sessions',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.lesson_date,s.period_no,s.class_code,s.id) FROM lesson_rows s),'[]'::jsonb),
  'attendance',CASE WHEN include_details THEN coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.session_id,a.student_id) FROM att a),'[]'::jsonb) ELSE '[]'::jsonb END,
  'observations',CASE WHEN include_details THEN coalesce((SELECT jsonb_agg(to_jsonb(o) ORDER BY o.observed_at,o.id) FROM obs o),'[]'::jsonb) ELSE '[]'::jsonb END,
  'support_logs',CASE WHEN include_details THEN coalesce((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.created_at,l.id) FROM support l),'[]'::jsonb) ELSE '[]'::jsonb END
 ) || CASE WHEN aggregate_access THEN jsonb_build_object(
  'summary',jsonb_build_object('students',(SELECT count(*) FROM roster WHERE active),'sessions',(SELECT count(*) FROM lessons),
   'attendance_recorded',(SELECT count(*) FROM att),'positive',(SELECT count(*) FROM obs WHERE category='positive'),
   'concern',(SELECT count(*) FROM obs WHERE category='concern'),'health',(SELECT count(*) FROM obs WHERE category='health')))
  ELSE '{}'::jsonb END INTO result;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.v4_account_activity_summary() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.v4_credentials_ready() OR NOT public.v4_admin() THEN RAISE EXCEPTION 'Chỉ quản trị được xem hoạt động tài khoản'; END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object(
  'user_id',t.user_id,'first_seen',v.first_seen,'last_seen',v.last_seen,'sessions_30d',v.sessions_30d,
  'lessons_30d',(SELECT count(*) FROM public.v4_sessions s WHERE s.teacher_id=t.user_id AND s.lesson_date BETWEEN public.v4_school_today()-29 AND public.v4_school_today()),
  'observations_30d',(SELECT count(*) FROM public.v4_observations o WHERE o.withdrawn_at IS NULL AND o.created_by=t.user_id AND o.observed_at>=now()-interval '30 days'),
  'attendance_30d',(SELECT count(*) FROM public.v4_attendance a JOIN public.v4_sessions s ON s.id=a.session_id WHERE s.teacher_id=t.user_id AND s.lesson_date BETWEEN public.v4_school_today()-29 AND public.v4_school_today())
 )) FROM public.v4_teachers t LEFT JOIN LATERAL(
  SELECT min(first_seen) first_seen,max(last_seen) last_seen,count(*) FILTER(WHERE first_seen>=now()-interval '30 days') sessions_30d
  FROM public.v4_account_visits WHERE user_id=t.user_id
 ) v ON true),'[]'::jsonb);
END $$;
NOTIFY pgrst,'reload schema';

-- SOURCE 39_v6_personal_lesson_week.sql
-- Own lesson review scope. Apply after38; no write-policy or historical identity changes.

DO $guard$ BEGIN
 IF to_regprocedure('public.v4_withdraw_observation(uuid,text,timestamptz)') IS NULL THEN
  RAISE EXCEPTION 'Cần cập nhật thu hồi ghi nhận38 trước báo cáo cá nhân39';
 END IF;
END $guard$;
CREATE OR REPLACE FUNCTION public.v4_my_lesson_week(y text,week_start date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE first_day date; last_day date; server_day date:=public.v4_school_today(); result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.v4_credentials_ready() THEN RAISE EXCEPTION 'Cần đăng nhập và hoàn tất mật khẩu để xem tiết của mình'; END IF;
 IF y IS NULL OR y !~ '^[0-9]{4}-[0-9]{4}$' OR split_part(y,'-',2)::integer<>split_part(y,'-',1)::integer+1 THEN RAISE EXCEPTION 'Năm học không hợp lệ'; END IF;
 IF week_start IS NULL THEN RAISE EXCEPTION 'Chọn tuần cần xem'; END IF;
 first_day:=date_trunc('week',week_start::timestamp)::date;last_day:=first_day+6;
 IF first_day>date_trunc('week',server_day::timestamp)::date THEN RAISE EXCEPTION 'Chỉ xem được tuần hiện tại hoặc các tuần trước'; END IF;
 WITH
 own AS MATERIALIZED(
  SELECT s.* FROM public.v4_sessions s WHERE s.teacher_id=auth.uid() AND s.school_year=y
   AND s.lesson_date BETWEEN first_day AND last_day AND public.v4_actual_class_access(s.school_year,s.class_code)
 ), atts AS MATERIALIZED(
  SELECT a.* FROM public.v4_attendance a JOIN own s ON s.id=a.session_id
 ), obs AS MATERIALIZED(
  SELECT o.* FROM public.v4_observations o JOIN own s ON s.id=o.session_id
   WHERE o.created_by=auth.uid() AND o.withdrawn_at IS NULL
 ), refs AS MATERIALIZED(
  SELECT student_id FROM atts UNION SELECT student_id FROM obs
 ), active_version AS MATERIALIZED(
  SELECT v.* FROM public.tkb_versions v WHERE v.is_active AND v.status='published' AND v.school_year=y
 ), teacher AS MATERIALIZED(
  SELECT t.teacher_code FROM public.v4_teachers t WHERE t.user_id=auth.uid()
 ), planned AS MATERIALIZED(
  SELECT d::date AS lesson_date,e.period_no,e.class_code,e.subject,e.version_id
  FROM generate_series(first_day::timestamp,last_day::timestamp,interval '1 day') d
   JOIN active_version v ON first_day=date_trunc('week',server_day::timestamp)::date
    AND d::date>=server_day AND v.effective_date<=d::date
   JOIN public.tkb_entries e ON e.version_id=v.id AND e.day_no=extract(isodow FROM d)::integer+1
   JOIN teacher t ON t.teacher_code=e.teacher_code
  WHERE (SELECT count(*) FROM active_version)=1 AND coalesce(e.status,'Học')='Học'
   AND public.v4_actual_class_access(y,e.class_code)
   AND NOT EXISTS(SELECT 1 FROM own s WHERE s.lesson_date=d::date AND s.period_no=e.period_no AND s.class_code=e.class_code)
 )
 SELECT jsonb_build_object('school_year',y,'week_start',first_day,'week_end',last_day,'server_today',server_day,'scope','own_lessons',
  'sessions',coalesce((SELECT jsonb_agg(to_jsonb(s)||jsonb_build_object(
    'can_write',public.v4_check_lesson_writable(s.id),
    'is_auto_ended',s.ended_at IS NULL AND coalesce(s.scheduled_end_at<=statement_timestamp(),false),
    'source_missing',s.timetable_version_id IS NULL OR v.id IS NULL,
    'version',CASE WHEN v.id IS NULL THEN NULL ELSE jsonb_build_object('id',v.id,'number',v.version_no,'name',v.version_name,'effective_date',v.effective_date) END,
    'review',(SELECT to_jsonb(r) FROM public.v4_lesson_reviews r WHERE r.session_id=s.id),
    'attendance_count',(SELECT count(*) FROM atts a WHERE a.session_id=s.id),
    'roster_count',jsonb_array_length(coalesce(public.v4_attendance_state(s.id)->'roster_ids','[]'::jsonb)),
    'ppct_status','not_linked') ORDER BY s.lesson_date,s.period_no,s.class_code)
   FROM own s LEFT JOIN public.tkb_versions v ON v.id::text=s.timetable_version_id),'[]'::jsonb),
  'attendance',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.session_id,a.student_id) FROM atts a),'[]'::jsonb),
  'observations',coalesce((SELECT jsonb_agg(to_jsonb(o) ORDER BY o.observed_at,o.id) FROM obs o),'[]'::jsonb),
  'students',coalesce((SELECT jsonb_agg(jsonb_build_object('id',st.id,'student_code',st.student_code,'full_name',st.full_name,'class_code',st.class_code) ORDER BY st.student_code,st.id) FROM public.v4_students st JOIN refs r ON r.student_id=st.id),'[]'::jsonb),
  'scheduled',coalesce((SELECT jsonb_agg(to_jsonb(p)||jsonb_build_object('source','active_timetable','ppct_status','not_linked') ORDER BY p.lesson_date,p.period_no,p.class_code) FROM planned p),'[]'::jsonb),
  'schedule_notice',CASE WHEN first_day<date_trunc('week',server_day::timestamp)::date THEN 'Tuần cũ chỉ hiển thị tiết đã ghi. Chưa đủ nguồn để khôi phục các ô TKB chưa mở.' ELSE 'Ô chưa mở chỉ theo TKB đang áp dụng từ hôm nay. Các ngày trước chỉ hiển thị tiết đã ghi.' END,
  'ppct_notice','Chưa có liên kết bài/tiết PPCT được lưu với từng tiết; không suy bài đã dạy từ lịch kế hoạch.') INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.v4_my_lesson_week(text,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.v4_my_lesson_week(text,date) TO authenticated;
NOTIFY pgrst,'reload schema';

NOTIFY pgrst,'reload schema';
COMMIT;
