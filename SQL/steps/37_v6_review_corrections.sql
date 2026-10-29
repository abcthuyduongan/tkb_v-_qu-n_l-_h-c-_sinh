-- Same-day correction guard: an observation UPDATE follows the same lesson
-- ownership/day/manual-close rules as a new observation, attendance and review.
-- Apply after36. No cancellation schema or report semantics are added here.
BEGIN;
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
COMMIT;
