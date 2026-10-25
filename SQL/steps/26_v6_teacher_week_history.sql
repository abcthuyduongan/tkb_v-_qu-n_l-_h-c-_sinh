-- Historical weekly reads for teachers with CURRENT class access. Apply after25.
-- No write-policy changes: prior school days remain read-only.
BEGIN;
DO $guard$ BEGIN
 IF to_regprocedure('public.v4_lesson_handoffs(text,text,date,date,text)') IS NULL OR
 position('linked-add-only' in coalesce(pg_get_functiondef(to_regprocedure('public.v4_preview_published_tkb()')),''))=0 THEN
  RAISE EXCEPTION 'Cần hoàn tất cập nhật đồng bộ25 (SQL07) trước khi thêm xem tuần cũ';
 END IF;
END $guard$;
DROP POLICY IF EXISTS v4_lesson_review_read ON public.v4_lesson_reviews;
CREATE POLICY v4_lesson_review_read ON public.v4_lesson_reviews FOR SELECT TO authenticated USING(
 public.v4_has_class(school_year,class_code) AND
 (public.v4_admin() OR public.v4_actual_homeroom(school_year,class_code) OR
  lesson_date<=date_trunc('week',public.v4_school_today()::timestamp)::date+6)
);
CREATE OR REPLACE FUNCTION public.v4_class_report(
 y text,c text,d1 date,d2 date,range_kind text DEFAULT 'week',include_details boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
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
 admin_access:=public.v4_admin();
 home_access:=cls IS NOT NULL AND public.v4_actual_homeroom(y,cls);
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
     WHERE o.school_year=y AND (cls IS NULL OR o.class_code=cls)
      AND coalesce(s.lesson_date,(o.observed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) BETWEEN d1 AND d2)
   +(SELECT count(*) FROM public.v4_support_logs l WHERE l.school_year=y AND (cls IS NULL OR l.class_code=cls)
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
   coalesce(s.ended_at,CASE WHEN nullif(to_jsonb(s)->>'scheduled_end_at','')::timestamptz<=statement_timestamp()
    THEN nullif(to_jsonb(s)->>'scheduled_end_at','')::timestamptz END) AS ended_at,
   nullif(to_jsonb(s)->>'scheduled_end_at','')::timestamptz AS scheduled_end_at,
   (s.ended_at IS NULL AND coalesce(nullif(to_jsonb(s)->>'scheduled_end_at','')::timestamptz<=statement_timestamp(),false)) AS is_auto_ended
  FROM public.v4_sessions s LEFT JOIN public.v4_teachers t ON t.user_id=s.teacher_id
  WHERE s.school_year=y AND (cls IS NULL OR s.class_code=cls) AND s.lesson_date BETWEEN d1 AND d2
 ), att AS MATERIALIZED (
  SELECT a.session_id,a.student_id,a.status,a.note,a.updated_at FROM public.v4_attendance a JOIN lessons s ON s.id=a.session_id
 ), obs AS MATERIALIZED (
  SELECT o.id,o.student_id,o.school_year,o.class_code,o.session_id,o.observed_at,o.category,o.behavior_code,
   o.activity_context,o.note,o.is_alert,o.attention_kind,o.created_by,t.teacher_name,
   s.lesson_date,s.period_no,s.subject
  FROM public.v4_observations o LEFT JOIN public.v4_sessions s ON s.id=o.session_id
   LEFT JOIN public.v4_teachers t ON t.user_id=o.created_by
  WHERE o.school_year=y AND (cls IS NULL OR o.class_code=cls)
   AND coalesce(s.lesson_date,(o.observed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) BETWEEN d1 AND d2
 ), support AS MATERIALIZED (
  SELECT l.id,l.school_year,l.class_code,l.student_id,l.activity_type,l.content,l.follow_up_on,l.created_at,l.created_by
  FROM public.v4_support_logs l WHERE l.school_year=y AND (cls IS NULL OR l.class_code=cls)
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
  'lesson_reviews',CASE WHEN include_details THEN coalesce((SELECT jsonb_agg(to_jsonb(r)||jsonb_build_object('teacher_name',t.teacher_name) ORDER BY r.lesson_date,r.session_id) FROM public.v4_lesson_reviews r LEFT JOIN public.v4_teachers t ON t.user_id=r.teacher_id WHERE r.school_year=y AND (cls IS NULL OR r.class_code=cls) AND r.lesson_date BETWEEN d1 AND d2),'[]'::jsonb) ELSE '[]'::jsonb END,
  'roster_basis','current_roster',
  'attendance_completeness','unknown_membership_history',
  'permissions',jsonb_build_object('admin',admin_access,'homeroom',home_access,'aggregate',aggregate_access,'export',aggregate_access,
   'health',EXISTS(SELECT 1 FROM public.v4_class_access WHERE user_id=auth.uid() AND school_year=y AND (cls IS NULL OR class_code=cls)),
   'support',EXISTS(SELECT 1 FROM public.v4_class_access WHERE user_id=auth.uid() AND school_year=y AND role='gvcn' AND (cls IS NULL OR class_code=cls))),
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
REVOKE ALL ON FUNCTION public.v4_class_report(text,text,date,date,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.v4_class_report(text,text,date,date,text,boolean) TO authenticated;
CREATE OR REPLACE FUNCTION public.v4_lesson_handoffs(
 y text,c text,d1 date,d2 date,range_kind text DEFAULT 'week') RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE cls text:=nullif(btrim(c),''); admin_access boolean; home_access boolean; result jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Cần đăng nhập để xem tổng hợp tiết học'; END IF;
 IF NOT public.v4_credentials_ready() THEN RAISE EXCEPTION 'Cần đổi mật khẩu trước khi xem dữ liệu lớp'; END IF;
 IF y IS NULL OR y !~ '^[0-9]{4}-[0-9]{4}$' OR split_part(y,'-',2)::integer<>split_part(y,'-',1)::integer+1 THEN RAISE EXCEPTION 'Năm học không hợp lệ'; END IF;
 IF cls IS NULL THEN RAISE EXCEPTION 'Chọn một lớp để xem tổng hợp tiết học'; END IF;
 IF d1 IS NULL OR d2 IS NULL OR d2<d1 OR d2-d1>369 THEN RAISE EXCEPTION 'Khoảng báo cáo phải từ 1 đến 370 ngày'; END IF;
 IF range_kind IS NULL OR range_kind NOT IN('week','month','semester','custom') THEN RAISE EXCEPTION 'Loại báo cáo không hợp lệ'; END IF;
 admin_access:=public.v4_admin();home_access:=public.v4_actual_homeroom(y,cls);
 IF NOT admin_access AND NOT public.v4_actual_class_access(y,cls) THEN RAISE EXCEPTION 'Không có quyền xem dữ liệu lớp này'; END IF;
 IF NOT admin_access AND NOT home_access AND range_kind<>'week' THEN RAISE EXCEPTION 'Giáo viên bộ môn chỉ xem đánh giá theo tuần'; END IF;
 IF range_kind='week' AND (d2-d1>6 OR date_trunc('week',d1::timestamp)<>date_trunc('week',d2::timestamp)) THEN RAISE EXCEPTION 'Chọn các ngày trong cùng một tuần';
 ELSIF range_kind='month' AND date_trunc('month',d1::timestamp)<>date_trunc('month',d2::timestamp) THEN RAISE EXCEPTION 'Chọn các ngày trong cùng một tháng';
 ELSIF range_kind='semester' AND d2-d1>219 THEN RAISE EXCEPTION 'Khoảng học kỳ tối đa 220 ngày';
 ELSIF range_kind='custom' AND NOT admin_access THEN RAISE EXCEPTION 'Khoảng tùy chọn chỉ dành cho quản trị'; END IF;
 IF NOT admin_access AND NOT home_access AND d2>date_trunc('week',public.v4_school_today()::timestamp)::date+6 THEN RAISE EXCEPTION 'Chỉ xem được tuần hiện tại hoặc các tuần trước'; END IF;
 WITH lessons AS MATERIALIZED(
  SELECT s.id,s.school_year,s.class_code,s.lesson_date,s.period_no,s.subject,s.teacher_id,t.teacher_name,s.scheduled_end_at,s.ended_at
  FROM public.v4_sessions s LEFT JOIN public.v4_teachers t ON t.user_id=s.teacher_id
  WHERE s.school_year=y AND s.class_code=cls AND s.lesson_date BETWEEN d1 AND d2
 ), attendance AS(
  SELECT a.session_id,count(*) AS confirmed,count(*) FILTER(WHERE a.status='present') AS present,
   count(*) FILTER(WHERE a.status='absent') AS absent,count(*) FILTER(WHERE a.status='late') AS late,
   count(*) FILTER(WHERE a.status='excused') AS excused,max(a.updated_at) AS updated_at
  FROM public.v4_attendance a JOIN lessons l ON l.id=a.session_id GROUP BY a.session_id
 ), observations AS(
  -- Learning handoff never includes health or support facts, even for viewers
  -- whose separate health RLS permits reading those records.
  SELECT o.session_id,count(*) FILTER(WHERE o.category='positive') AS positive,
   count(*) FILTER(WHERE o.category='concern') AS concern,max(coalesce(o.edited_at,o.observed_at)) AS updated_at
  FROM public.v4_observations o JOIN lessons l ON l.id=o.session_id
  WHERE o.category IN('positive','concern') GROUP BY o.session_id
 ), facts AS(
  SELECT l.*,coalesce(a.confirmed,0) AS confirmed,coalesce(a.present,0) AS present,
   coalesce(a.absent,0) AS absent,coalesce(a.late,0) AS late,coalesce(a.excused,0) AS excused,
   coalesce(o.positive,0) AS positive,coalesce(o.concern,0) AS concern,
   greatest(a.updated_at,o.updated_at) AS facts_updated_at,r.id AS review_id,r.note AS teacher_note,r.confirmed_at
  FROM lessons l LEFT JOIN attendance a ON a.session_id=l.id LEFT JOIN observations o ON o.session_id=l.id
   LEFT JOIN public.v4_lesson_reviews r ON r.session_id=l.id
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',f.id,'session_id',f.id,'school_year',f.school_year,'class_code',f.class_code,'lesson_date',f.lesson_date,
  'period_no',f.period_no,'subject',f.subject,'teacher_id',f.teacher_id,'teacher_name',f.teacher_name,
  'source',CASE WHEN f.review_id IS NOT NULL THEN 'teacher' ELSE 'system' END,
  'source_label',CASE WHEN f.review_id IS NOT NULL THEN 'Giáo viên đã xác nhận' ELSE 'Tổng hợp hệ thống' END,
  'stage',CASE WHEN f.ended_at IS NOT NULL OR f.scheduled_end_at<=statement_timestamp() THEN 'final' WHEN f.scheduled_end_at IS NULL THEN 'unknown' ELSE 'in_progress' END,
  'scheduled_end_at',f.scheduled_end_at,'confirmed_at',f.confirmed_at,'generated_at',statement_timestamp(),
  'facts_updated_at',f.facts_updated_at,'review_id',f.review_id,
  'attendance_confirmed',f.confirmed,'present',f.present,'absent',f.absent,'late',f.late,'excused',f.excused,
  'positive',f.positive,'concern',f.concern,'unrecorded',NULL,'attendance_completeness','recorded_only',
  'note',CASE WHEN f.review_id IS NOT NULL THEN f.teacher_note
   WHEN f.confirmed=0 AND f.positive=0 AND f.concern=0 THEN 'Chưa có dữ liệu điểm danh hoặc nhận xét học sinh được lưu cho tiết này.'
   ELSE concat('Điểm danh đã xác nhận: ',f.confirmed,' lượt; có mặt: ',f.present,'; vắng: ',f.absent,'; muộn: ',f.late,'; có phép: ',f.excused,
    '. Nhận xét đã lưu: ',f.positive,' lượt tích cực, ',f.concern,' lượt cần cải thiện. Chưa xác nhận điểm danh không được suy thành có mặt hoặc vắng.') END
 ) ORDER BY f.lesson_date,f.period_no,f.id),'[]'::jsonb) INTO result FROM facts f;
 RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.v4_lesson_handoffs(text,text,date,date,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.v4_lesson_handoffs(text,text,date,date,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
