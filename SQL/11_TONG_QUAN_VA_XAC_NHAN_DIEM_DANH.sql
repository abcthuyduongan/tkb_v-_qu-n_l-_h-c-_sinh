-- Sau SQL10/module31. Chi ap dung co che tu dong cho tiet moi, khong tu xac nhan lich su.
BEGIN;
-- Apply after31. Automatic presence is derived from a saved roster and server
-- clock, so it works with the browser closed and never impersonates a teacher.

DO $$ BEGIN
 IF to_regprocedure('public.v4_account_activity_summary()') IS NULL THEN
  RAISE EXCEPTION 'Cần cập nhật module đến31 trước khi cập nhật điểm danh';
 END IF;
END $$;
ALTER TABLE public.v4_sessions ADD COLUMN IF NOT EXISTS attendance_policy_version smallint NOT NULL DEFAULT 0;
ALTER TABLE public.v4_sessions ALTER COLUMN attendance_policy_version SET DEFAULT 1;
CREATE TABLE IF NOT EXISTS public.v4_session_roster(
 session_id uuid NOT NULL REFERENCES public.v4_sessions(id) ON DELETE CASCADE,
 student_id uuid NOT NULL REFERENCES public.v4_students(id),
 PRIMARY KEY(session_id,student_id)
);
ALTER TABLE public.v4_session_roster ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.v4_session_roster FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.v4_capture_session_roster() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 INSERT INTO public.v4_session_roster(session_id,student_id)
 SELECT NEW.id,id FROM public.v4_students WHERE school_year=NEW.school_year AND class_code=NEW.class_code AND active;
 RETURN NEW;
END $$;
-- A student removed later in the day still belongs to the saved lesson roster.
CREATE OR REPLACE FUNCTION public.v4_validate_attendance() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE lesson public.v4_sessions;
BEGIN
 SELECT * INTO lesson FROM public.v4_sessions WHERE id=NEW.session_id;
 IF NOT FOUND OR NOT (public.v4_student_class(NEW.student_id,lesson.school_year,lesson.class_code)
  OR EXISTS(SELECT 1 FROM public.v4_session_roster r WHERE r.session_id=NEW.session_id AND r.student_id=NEW.student_id)) THEN
  RAISE EXCEPTION 'Học sinh không thuộc tiết học';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.v4_validate_attendance() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.v4_attendance_policy_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP='INSERT' THEN NEW.attendance_policy_version:=1;
 ELSIF NEW.attendance_policy_version IS DISTINCT FROM OLD.attendance_policy_version THEN
  RAISE EXCEPTION 'Không được thay đổi chính sách điểm danh của tiết đã mở';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS v4_attendance_policy ON public.v4_sessions;
CREATE TRIGGER v4_attendance_policy BEFORE INSERT OR UPDATE ON public.v4_sessions FOR EACH ROW EXECUTE FUNCTION public.v4_attendance_policy_guard();
DROP TRIGGER IF EXISTS v4_capture_roster ON public.v4_sessions;
CREATE TRIGGER v4_capture_roster AFTER INSERT ON public.v4_sessions FOR EACH ROW EXECUTE FUNCTION public.v4_capture_session_roster();
REVOKE ALL ON FUNCTION public.v4_capture_session_roster(),public.v4_attendance_policy_guard() FROM PUBLIC,anon,authenticated;

-- Internal summary. Callers expose only the fields their role is permitted to see.
CREATE OR REPLACE FUNCTION public.v4_completion_rows(y text,c text,d1 date,d2 date,scope_kind text)
RETURNS TABLE(id uuid,class_code text,lesson_date date,period_no integer,subject text,teacher_name text,
 teacher_id uuid,expected bigint,confirmed bigint,automatic_present bigint,missing bigint,
 absent bigint,late bigint,excused bigint,attendance_state text,review_confirmed boolean,can_write boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 WITH lessons AS MATERIALIZED (
  SELECT s.* FROM public.v4_sessions s WHERE s.school_year=y AND (nullif(c,'') IS NULL OR s.class_code=c)
   AND s.lesson_date BETWEEN d1 AND d2 AND (
    scope_kind='school' AND (public.v4_admin() OR public.v4_school_report_access()) OR
    scope_kind='own' AND s.teacher_id=auth.uid() AND public.v4_actual_class_access(y,s.class_code) OR
    scope_kind='homeroom' AND public.v4_actual_homeroom(y,s.class_code) OR
    scope_kind='class' AND (public.v4_admin() OR public.v4_actual_class_access(y,s.class_code))
   )
 ), roster_counts AS (
  SELECT session_id,count(*) AS n FROM (
   SELECT r.session_id,r.student_id FROM public.v4_session_roster r JOIN lessons l ON l.id=r.session_id
   UNION
   SELECT a.session_id,a.student_id FROM public.v4_attendance a JOIN lessons l ON l.id=a.session_id
  ) u GROUP BY session_id
 ), att_counts AS (
  SELECT a.session_id,count(*) AS recorded,
   count(*) FILTER(WHERE a.status='absent') AS a,
   count(*) FILTER(WHERE a.status='late') AS l,
   count(*) FILTER(WHERE a.status='excused') AS e
  FROM public.v4_attendance a JOIN lessons l ON l.id=a.session_id GROUP BY a.session_id
 ), rev_sessions AS (
  SELECT DISTINCT r.session_id FROM public.v4_lesson_reviews r JOIN lessons l ON l.id=r.session_id
 ), counts AS (
  SELECT s.*,t.teacher_name,
   CASE WHEN s.attendance_policy_version=1 THEN coalesce(rc.n,0) END n,
   coalesce(ac.recorded,0) recorded,
   coalesce(ac.a,0) a,
   coalesce(ac.l,0) l,
   coalesce(ac.e,0) e,
   (rs.session_id IS NOT NULL) has_review
  FROM lessons s LEFT JOIN public.v4_teachers t ON t.user_id=s.teacher_id
   LEFT JOIN roster_counts rc ON rc.session_id=s.id
   LEFT JOIN att_counts ac ON ac.session_id=s.id
   LEFT JOIN rev_sessions rs ON rs.session_id=s.id
 )
 SELECT s.id,s.class_code,s.lesson_date,s.period_no,s.subject,s.teacher_name,s.teacher_id,s.n,s.recorded,
  CASE WHEN s.attendance_policy_version=1 AND s.ended_at IS NULL AND s.scheduled_end_at<=statement_timestamp()
   THEN greatest(0,s.n-s.recorded) ELSE 0 END,
  CASE WHEN s.n IS NOT NULL THEN greatest(0,s.n-s.recorded) END,
  s.a,s.l,s.e,
  CASE WHEN s.n IS NULL THEN 'legacy_unknown' WHEN s.n=0 THEN 'empty'
   WHEN s.recorded>=s.n THEN 'confirmed' ELSE 'pending' END,
  s.has_review,
  public.v4_check_lesson_writable(s.id)
 FROM counts s
$$;
REVOKE ALL ON FUNCTION public.v4_completion_rows(text,text,date,date,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.v4_attendance_state(sess uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE lesson public.v4_sessions; summary jsonb; automatic jsonb;
BEGIN
 SELECT * INTO lesson FROM public.v4_sessions WHERE id=sess;
 IF NOT FOUND OR NOT public.v4_credentials_ready() OR NOT public.v4_has_class(lesson.school_year,lesson.class_code) THEN
  RAISE EXCEPTION 'Không có quyền xem điểm danh của tiết';
 END IF;
 SELECT to_jsonb(r) INTO summary FROM public.v4_completion_rows(lesson.school_year,lesson.class_code,lesson.lesson_date,lesson.lesson_date,'class') r WHERE r.id=sess;
 SELECT coalesce(jsonb_agg(jsonb_build_object('session_id',sess,'student_id',r.student_id,'status','present','source','automatic','confirmed',false)),'[]'::jsonb)
 INTO automatic FROM public.v4_session_roster r WHERE r.session_id=sess
  AND lesson.attendance_policy_version=1 AND lesson.ended_at IS NULL AND lesson.scheduled_end_at<=statement_timestamp()
  AND NOT EXISTS(SELECT 1 FROM public.v4_attendance a WHERE a.session_id=sess AND a.student_id=r.student_id);
 RETURN jsonb_build_object('summary',summary,'automatic',automatic,'server_today',public.v4_school_today(),'roster_ids',CASE WHEN lesson.attendance_policy_version=1 THEN coalesce((SELECT jsonb_agg(student_id) FROM public.v4_session_roster WHERE session_id=sess),'[]'::jsonb) END);
END $$;

CREATE TABLE IF NOT EXISTS public.v4_attendance_confirmation_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),session_id uuid NOT NULL REFERENCES public.v4_sessions(id),
 actor_id uuid NOT NULL REFERENCES auth.users(id),confirmed_at timestamptz NOT NULL DEFAULT statement_timestamp(),
 added_students jsonb NOT NULL
);
ALTER TABLE public.v4_attendance_confirmation_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.v4_attendance_confirmation_events FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.v4_confirm_attendance(sess uuid,expected_rows jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE lesson public.v4_sessions; actual jsonb; added jsonb;
BEGIN
 SELECT * INTO lesson FROM public.v4_sessions WHERE id=sess FOR UPDATE;
 IF NOT FOUND OR NOT public.v4_credentials_ready() OR NOT public.v4_check_lesson_writable(sess) THEN
  RAISE EXCEPTION 'Chỉ giáo viên phụ trách được xác nhận điểm danh trong ngày học';
 END IF;
 IF expected_rows IS NULL OR jsonb_typeof(expected_rows)<>'array' THEN RAISE EXCEPTION 'Cần đọc lại điểm danh trước khi xác nhận'; END IF;
 -- Locking each attendance row makes a status edit serialize with this check.
 PERFORM 1 FROM public.v4_attendance WHERE session_id=sess ORDER BY student_id FOR UPDATE;
 SELECT coalesce(jsonb_agg(jsonb_build_object('student_id',student_id,'status',status,'note',note,'updated_at',updated_at) ORDER BY student_id),'[]'::jsonb)
 INTO actual FROM public.v4_attendance WHERE session_id=sess;
 SELECT coalesce(jsonb_agg(jsonb_build_object('student_id',student_id,'status',status,'note',note,'updated_at',updated_at) ORDER BY student_id),'[]'::jsonb) INTO expected_rows FROM jsonb_to_recordset(expected_rows) AS r(student_id uuid,status text,note text,updated_at timestamptz);
 IF expected_rows IS NULL OR actual<>expected_rows THEN RAISE EXCEPTION 'Điểm danh đã thay đổi ở nơi khác. Hãy làm mới và kiểm tra trước khi xác nhận'; END IF;
 WITH inserted AS (
  INSERT INTO public.v4_attendance(session_id,student_id,status,note,updated_by)
  SELECT sess,r.student_id,'present','',auth.uid() FROM (
   SELECT student_id FROM public.v4_session_roster WHERE session_id=sess
   UNION SELECT id FROM public.v4_students WHERE school_year=lesson.school_year AND class_code=lesson.class_code AND active
  ) r ON CONFLICT DO NOTHING RETURNING student_id
 ) SELECT coalesce(jsonb_agg(student_id),'[]'::jsonb) INTO added FROM inserted;
 IF jsonb_array_length(added)>0 THEN
  INSERT INTO public.v4_attendance_confirmation_events(session_id,actor_id,added_students) VALUES(sess,auth.uid(),added);
 END IF;
 RETURN public.v4_attendance_state(sess);
END $$;
-- A normal REST status change and batch confirmation share the session lock.
CREATE OR REPLACE FUNCTION public.v4_attendance_session_lock() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN PERFORM 1 FROM public.v4_sessions WHERE id=NEW.session_id FOR UPDATE; RETURN NEW; END $$;
DROP TRIGGER IF EXISTS v4_attendance_session_lock ON public.v4_attendance;
CREATE TRIGGER v4_attendance_session_lock BEFORE INSERT OR UPDATE ON public.v4_attendance FOR EACH ROW EXECUTE FUNCTION public.v4_attendance_session_lock();
REVOKE ALL ON FUNCTION public.v4_attendance_session_lock() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.v4_attendance_state(uuid),public.v4_confirm_attendance(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.v4_attendance_state(uuid),public.v4_confirm_attendance(uuid,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
-- Apply after32. Overview only returns counts and lesson identities, no health notes.

DO $$ BEGIN IF to_regprocedure('public.v4_attendance_state(uuid)') IS NULL THEN RAISE EXCEPTION 'Cần cập nhật32 trước33'; END IF; END $$;
ALTER TABLE public.v4_lesson_reviews ADD COLUMN IF NOT EXISTS rating text CHECK(rating IN('positive','adequate','reminder','support'));
ALTER TABLE public.v4_lesson_reviews ADD COLUMN IF NOT EXISTS detail_note text;
-- A still-open older client may save a plain text review. Clear a previous
-- quick rating when that client changes the note without its rating fields.
CREATE OR REPLACE FUNCTION public.v4_plain_review_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.note IS DISTINCT FROM OLD.note AND NEW.rating IS NOT DISTINCT FROM OLD.rating
  AND NEW.detail_note IS NOT DISTINCT FROM OLD.detail_note THEN NEW.rating:=NULL;NEW.detail_note:=NULL;END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS v4_plain_review ON public.v4_lesson_reviews;
CREATE TRIGGER v4_plain_review BEFORE UPDATE ON public.v4_lesson_reviews FOR EACH ROW EXECUTE FUNCTION public.v4_plain_review_guard();
REVOKE ALL ON FUNCTION public.v4_plain_review_guard() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.v4_save_quick_review(sess uuid,rating_code text,content text,expected_at timestamptz DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE lesson public.v4_sessions; previous public.v4_lesson_reviews; saved public.v4_lesson_reviews; caption text;
BEGIN
 SELECT * INTO lesson FROM public.v4_sessions WHERE id=sess FOR UPDATE;
 IF NOT FOUND OR NOT public.v4_credentials_ready() OR NOT public.v4_check_lesson_writable(sess) THEN
  RAISE EXCEPTION 'Chỉ giáo viên phụ trách được nhận định tiết học trong ngày';
 END IF;
 caption:=CASE rating_code WHEN 'positive' THEN 'Học tập tích cực' WHEN 'adequate' THEN 'Cơ bản đạt yêu cầu'
  WHEN 'reminder' THEN 'Cần nhắc nhở' WHEN 'support' THEN 'Cần hỗ trợ thêm' END;
 IF (rating_code IS NOT NULL AND caption IS NULL) OR content IS NULL OR length(content)>900 OR (rating_code IS NULL AND length(btrim(content))<3) THEN RAISE EXCEPTION 'Chọn nhận định hợp lệ và ghi chú tối đa 900 ký tự'; END IF;
 SELECT * INTO previous FROM public.v4_lesson_reviews WHERE session_id=sess FOR UPDATE;
 IF previous.confirmed_at IS DISTINCT FROM expected_at THEN RAISE EXCEPTION 'Nhận định đã thay đổi ở nơi khác. Hãy làm mới trước khi lưu'; END IF;
 INSERT INTO public.v4_lesson_reviews(session_id,school_year,class_code,lesson_date,teacher_id,note,rating,detail_note)
 VALUES(sess,lesson.school_year,lesson.class_code,lesson.lesson_date,auth.uid(),CASE WHEN caption IS NULL THEN btrim(content) ELSE caption||CASE WHEN btrim(content)<>'' THEN ' — '||btrim(content) ELSE '' END END,rating_code,btrim(content))
 ON CONFLICT(session_id) DO UPDATE SET note=excluded.note,rating=excluded.rating,detail_note=excluded.detail_note,confirmed_at=statement_timestamp()
 RETURNING * INTO saved;
 RETURN to_jsonb(saved);
END $$;
REVOKE ALL ON FUNCTION public.v4_save_quick_review(uuid,text,text,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.v4_save_quick_review(uuid,text,text,timestamptz) TO authenticated;

CREATE TABLE IF NOT EXISTS public.v4_attendance_changes(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),session_id uuid NOT NULL REFERENCES public.v4_sessions(id),
 student_id uuid NOT NULL REFERENCES public.v4_students(id),actor_id uuid NOT NULL REFERENCES auth.users(id),
 changed_at timestamptz NOT NULL DEFAULT statement_timestamp(),old_value jsonb,new_value jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS v4_attendance_changes_session ON public.v4_attendance_changes(session_id,changed_at DESC);
ALTER TABLE public.v4_attendance_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.v4_attendance_changes FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.v4_capture_attendance_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE prior jsonb;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF ROW(NEW.status,NEW.note) IS NOT DISTINCT FROM ROW(OLD.status,OLD.note) THEN RETURN NEW; END IF;
  prior:=jsonb_build_object('status',OLD.status,'note',OLD.note,'source','teacher');
 ELSE
  IF EXISTS(SELECT 1 FROM public.v4_sessions s JOIN public.v4_session_roster r ON r.session_id=s.id
   WHERE s.id=NEW.session_id AND r.student_id=NEW.student_id AND s.attendance_policy_version=1 AND s.ended_at IS NULL AND s.scheduled_end_at<=statement_timestamp()) THEN
   prior:=jsonb_build_object('status','present','source','automatic','confirmed',false);
  END IF;
 END IF;
 INSERT INTO public.v4_attendance_changes(session_id,student_id,actor_id,old_value,new_value)
 VALUES(NEW.session_id,NEW.student_id,coalesce(auth.uid(),NEW.updated_by),prior,jsonb_build_object('status',NEW.status,'note',NEW.note,'source','teacher','confirmed',true));
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS v4_attendance_changes ON public.v4_attendance;
CREATE TRIGGER v4_attendance_changes AFTER INSERT OR UPDATE ON public.v4_attendance FOR EACH ROW EXECUTE FUNCTION public.v4_capture_attendance_change();
REVOKE ALL ON FUNCTION public.v4_capture_attendance_change() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.v4_attendance_history(sess uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE lesson public.v4_sessions;
BEGIN
 SELECT * INTO lesson FROM public.v4_sessions WHERE id=sess;
 IF NOT FOUND OR NOT public.v4_credentials_ready() OR NOT public.v4_actual_class_access(lesson.school_year,lesson.class_code)
  OR NOT (lesson.teacher_id=auth.uid() OR public.v4_actual_homeroom(lesson.school_year,lesson.class_code)) THEN
  RAISE EXCEPTION 'Không có quyền xem lịch sử điều chỉnh của tiết';
 END IF;
 RETURN coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM (
  SELECT h.changed_at,h.old_value,h.new_value,s.full_name,t.teacher_name FROM public.v4_attendance_changes h
  JOIN public.v4_students s ON s.id=h.student_id LEFT JOIN public.v4_teachers t ON t.user_id=h.actor_id
  WHERE h.session_id=sess ORDER BY h.changed_at DESC,h.id DESC LIMIT 100
 ) r),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.v4_attendance_history(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.v4_attendance_history(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.v4_report_completion(y text,c text,d1 date,d2 date,scope_kind text DEFAULT 'class') RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT public.v4_credentials_ready() OR y IS NULL OR y !~ '^[0-9]{4}-[0-9]{4}$'
  OR d1 IS NULL OR d2 IS NULL OR d2<d1 OR d2-d1>369 THEN RAISE EXCEPTION 'Khoảng tổng quan không hợp lệ'; END IF;
 IF scope_kind NOT IN('own','homeroom','class','school') OR scope_kind IS NULL THEN RAISE EXCEPTION 'Phạm vi không hợp lệ'; END IF;
 IF scope_kind='school' AND NOT(public.v4_admin() OR public.v4_school_report_access()) THEN RAISE EXCEPTION 'Không có quyền xem toàn trường'; END IF;
 IF scope_kind='class' AND NOT public.v4_admin() AND (nullif(c,'') IS NULL OR NOT public.v4_actual_class_access(y,c)) THEN RAISE EXCEPTION 'Không có quyền xem lớp'; END IF;
 RETURN jsonb_build_object('completion',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY lesson_date DESC,period_no,class_code)
  FROM public.v4_completion_rows(y,c,d1,d2,scope_kind) r),'[]'::jsonb),'server_today',public.v4_school_today());
END $$;
REVOKE ALL ON FUNCTION public.v4_report_completion(text,text,date,date,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.v4_report_completion(text,text,date,date,text) TO authenticated;

-- Today uses the currently active published timetable. Historical completeness
-- is never inferred from today's timetable. Opened lessons remain a separate count.
CREATE OR REPLACE FUNCTION public.v4_overview(y text,d1 date,d2 date,scope_kind text DEFAULT 'own') RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb; schedule jsonb;
BEGIN
 result:=public.v4_report_completion(y,'',d1,d2,scope_kind);
 SELECT coalesce(jsonb_agg(to_jsonb(e)),'[]'::jsonb) INTO schedule FROM (
  SELECT DISTINCT t.class_code,t.period_no,t.subject,public.v4_school_today() lesson_date,
   EXISTS(SELECT 1 FROM public.v4_sessions s WHERE s.school_year=y AND s.class_code=t.class_code
    AND s.period_no=t.period_no AND s.lesson_date=public.v4_school_today()) opened
  FROM public.tkb_entries t JOIN public.tkb_versions v ON v.id=t.version_id
  
  WHERE v.id=(SELECT id FROM public.tkb_versions WHERE status='published' AND is_active AND school_year=y ORDER BY published_at DESC NULLS LAST,id LIMIT 1)
   AND (v.effective_date IS NULL OR v.effective_date<=public.v4_school_today())
   AND t.day_no=extract(isodow FROM public.v4_school_today())::integer+1
   AND (t.status IS NULL OR t.status='Học') AND public.v4_school_today() BETWEEN d1 AND d2
   AND (scope_kind='own' AND NOT public.v4_admin() AND public.v4_actual_class_access(y,t.class_code) AND EXISTS(SELECT 1 FROM public.v4_teachers p WHERE p.user_id=auth.uid() AND p.teacher_code=t.teacher_code)
    OR scope_kind='homeroom' AND public.v4_actual_homeroom(y,t.class_code)
    OR scope_kind='school' AND (public.v4_admin() OR public.v4_school_report_access()))
 ) e;
 RETURN result||jsonb_build_object('scheduled_today',schedule,'scope',scope_kind);
END $$;
REVOKE ALL ON FUNCTION public.v4_overview(text,date,date,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.v4_overview(text,date,date,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
