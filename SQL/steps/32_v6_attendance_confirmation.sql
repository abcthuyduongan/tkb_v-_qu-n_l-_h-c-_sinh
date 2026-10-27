-- Apply after31. Automatic presence is derived from a saved roster and server
-- clock, so it works with the browser closed and never impersonates a teacher.
BEGIN;
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
COMMIT;
