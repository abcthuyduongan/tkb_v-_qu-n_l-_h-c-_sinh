-- Retire new substitute sessions; preserve migration06 year and teacher verification and all history.
BEGIN;
CREATE OR REPLACE FUNCTION public.v4_verify_session() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE tcode text;
BEGIN
 IF NEW.source='day_thay' THEN RAISE EXCEPTION 'Chế độ dạy thay đã ngừng sử dụng. Liên hệ quản trị cập nhật phân công TKB.'; END IF;
 IF NEW.source='tkb' THEN
  IF NEW.timetable_version_id IS NULL THEN RAISE EXCEPTION 'Chưa xác định bản thời khóa biểu'; END IF;
  SELECT teacher_code INTO tcode FROM public.v4_teachers WHERE user_id=NEW.teacher_id;
  IF tcode IS NULL OR NOT EXISTS(
   SELECT 1 FROM public.tkb_entries e JOIN public.tkb_versions v ON v.id=e.version_id
   WHERE e.version_id::text=NEW.timetable_version_id AND v.status='published' AND v.is_active=true
    AND v.school_year=NEW.school_year AND e.teacher_code=tcode AND e.class_code=NEW.class_code
    AND e.period_no=NEW.period_no AND e.day_no=extract(isodow FROM NEW.lesson_date)::integer+1
    AND e.subject=NEW.subject
  ) THEN RAISE EXCEPTION 'Tiết này không khớp TKB/năm học của giáo viên. Liên hệ quản trị cập nhật phân công.'; END IF;
 ELSE
  IF length(btrim(NEW.override_reason))<10 THEN
   RAISE EXCEPTION 'Cần ghi lý do ít nhất 10 ký tự khi chọn thủ công';
  END IF;
 END IF;
 RETURN NEW;
END $$;

COMMIT;
