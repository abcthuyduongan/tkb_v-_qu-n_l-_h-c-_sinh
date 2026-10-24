-- A lesson becomes read-only after its school day, even if never closed.
BEGIN;
CREATE OR REPLACE FUNCTION public.v4_school_today() RETURNS date
LANGUAGE sql STABLE SET search_path=public AS $$
 SELECT (statement_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
$$;

CREATE OR REPLACE FUNCTION public.v4_check_lesson_writable(sess uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.v4_sessions x WHERE x.id=sess
   AND x.teacher_id=auth.uid() AND x.ended_at IS NULL
   AND x.lesson_date=public.v4_school_today()
   AND public.v4_actual_class_access(x.school_year,x.class_code))
$$;

CREATE OR REPLACE FUNCTION public.v4_same_day_session_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.lesson_date<>public.v4_school_today() THEN
  RAISE EXCEPTION 'Chỉ được ghi nhận tiết học trong ngày hiện tại (giờ Việt Nam)';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS v4_same_day_session ON public.v4_sessions;
CREATE TRIGGER v4_same_day_session BEFORE INSERT OR UPDATE ON public.v4_sessions
 FOR EACH ROW EXECUTE FUNCTION public.v4_same_day_session_guard();

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
  IF TG_OP='INSERT' AND NOT public.v4_check_lesson_writable(NEW.session_id) THEN
   RAISE EXCEPTION 'Tiết đã khóa, kết thúc hoặc không thuộc giáo viên này';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.v4_sessions x WHERE x.id=NEW.session_id AND x.lesson_date=public.v4_school_today()) THEN
   RAISE EXCEPTION 'Tiết ngày trước đã khóa, chỉ được xem lại';
  END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS v4_same_day_observation ON public.v4_observations;
CREATE TRIGGER v4_same_day_observation BEFORE INSERT OR UPDATE ON public.v4_observations
 FOR EACH ROW EXECUTE FUNCTION public.v4_same_day_observation_guard();
-- Reads, history and current-day follow-up of an old health alert remain available.
COMMIT;
