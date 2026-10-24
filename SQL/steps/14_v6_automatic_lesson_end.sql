-- V6: lessons end at their saved timetable clock, without a browser or cron.
-- Automatic ending is a derived server state. It does not write ended_at or
-- confirm attendance; the teacher may complete saved work during the same day.
BEGIN;
ALTER TABLE public.v4_sessions ADD COLUMN IF NOT EXISTS scheduled_end_at timestamptz;
DROP TRIGGER IF EXISTS v4_schedule_session ON public.v4_sessions;
-- Backfill only the new field. The table lock taken by ALTER TABLE protects
-- this transaction while its named current-day trigger is temporarily paused.
-- All other identity/ownership triggers and all existing manual closures remain.
ALTER TABLE public.v4_sessions DISABLE TRIGGER v4_same_day_session;
UPDATE public.v4_sessions s SET scheduled_end_at=(s.lesson_date+t.end_time) AT TIME ZONE 'Asia/Ho_Chi_Minh'
 FROM public.v4_lesson_times t WHERE s.period_no=t.period_no AND s.scheduled_end_at IS NULL;
ALTER TABLE public.v4_sessions ENABLE TRIGGER v4_same_day_session;

CREATE OR REPLACE FUNCTION public.v4_schedule_session_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
DECLARE closing_time time;
BEGIN
 IF TG_OP='INSERT' THEN
  SELECT end_time INTO closing_time FROM public.v4_lesson_times WHERE period_no=NEW.period_no;
  IF closing_time IS NULL THEN RAISE EXCEPTION 'Chưa cấu hình giờ kết thúc tiết %. Liên hệ quản trị để bổ sung giờ học.',NEW.period_no; END IF;
  -- Ignore any client-supplied schedule; the trusted clock is copied once.
  NEW.scheduled_end_at:=(NEW.lesson_date+closing_time) AT TIME ZONE 'Asia/Ho_Chi_Minh';
 ELSIF NEW.scheduled_end_at IS DISTINCT FROM OLD.scheduled_end_at THEN
  RAISE EXCEPTION 'Không được sửa giờ kết thúc đã lưu của tiết học';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER v4_schedule_session BEFORE INSERT OR UPDATE ON public.v4_sessions
 FOR EACH ROW EXECUTE FUNCTION public.v4_schedule_session_guard();
REVOKE ALL ON FUNCTION public.v4_schedule_session_guard() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.v4_session_status(sess uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE lesson public.v4_sessions%ROWTYPE; clock_now timestamptz:=statement_timestamp(); automatic boolean; writable boolean;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Cần đăng nhập để xem tiết học'; END IF;
 SELECT * INTO lesson FROM public.v4_sessions WHERE id=sess;
 IF NOT FOUND THEN RAISE EXCEPTION 'Không có quyền xem tiết học hoặc tiết không còn tồn tại'; END IF;
 automatic:=lesson.ended_at IS NULL AND lesson.scheduled_end_at IS NOT NULL AND clock_now>=lesson.scheduled_end_at;
 writable:=public.v4_check_lesson_writable(lesson.id);
 RETURN jsonb_build_object('id',lesson.id,'scheduled_end_at',lesson.scheduled_end_at,
  'ended_at',coalesce(lesson.ended_at,CASE WHEN automatic THEN lesson.scheduled_end_at END),
  'manual_ended_at',lesson.ended_at,'is_auto_ended',automatic,'server_now',clock_now,
  'school_today',public.v4_school_today(),'can_write',writable,'read_only',NOT writable);
END $$;
REVOKE ALL ON FUNCTION public.v4_session_status(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.v4_session_status(uuid) TO authenticated;
COMMENT ON COLUMN public.v4_sessions.scheduled_end_at IS 'Server-saved lesson end in Asia/Ho_Chi_Minh; automatic state does not close same-day writing.';
COMMIT;
