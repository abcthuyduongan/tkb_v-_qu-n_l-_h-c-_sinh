-- Morning timetable confirmed by the school on 23/10/2026.
-- Opening activity 07:00–07:15 is not a numbered lesson.
BEGIN;
INSERT INTO public.v4_lesson_times(period_no,start_time,end_time) VALUES
 (1,'07:15','08:00'),(2,'08:00','08:45'),(3,'08:55','09:40'),
 (4,'09:40','10:25'),(5,'10:30','11:15')
ON CONFLICT(period_no) DO UPDATE SET start_time=excluded.start_time,end_time=excluded.end_time;

CREATE OR REPLACE FUNCTION public.v4_check_time_overlap() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.v4_lesson_times a JOIN public.v4_lesson_times b
  ON a.period_no<b.period_no AND a.start_time<b.end_time AND b.start_time<a.end_time) THEN
  RAISE EXCEPTION 'Khung giờ các tiết không được chồng nhau';
 END IF;
 RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS v4_guard_time_overlap ON public.v4_lesson_times;
CREATE CONSTRAINT TRIGGER v4_guard_time_overlap AFTER INSERT OR UPDATE ON public.v4_lesson_times
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.v4_check_time_overlap();
REVOKE ALL ON FUNCTION public.v4_check_time_overlap() FROM PUBLIC,anon,authenticated;
COMMIT;
