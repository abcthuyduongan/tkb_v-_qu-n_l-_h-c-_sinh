-- Student roster maintenance. Keeps pupil IDs, lesson history and all tkb_* data.
-- Apply after26. No hard delete, transfer or grants to ordinary subject teachers.
BEGIN;
DO $guard$
BEGIN
 IF to_regprocedure('public.v4_actual_homeroom(text,text)') IS NULL
 OR to_regprocedure('public.v4_credentials_ready()') IS NULL
 OR to_regprocedure('public.v4_school_year_valid(text)') IS NULL THEN
  RAISE EXCEPTION 'Cần hoàn tất module quản lý học sinh hiện tại trước khi cập nhật.';
 END IF;
END $guard$;
-- Existing trigger invalidates approval on insert/reactivation/deactivation.
-- Detach only the seat when a pupil leaves; attendance/observations/support stay intact.
CREATE OR REPLACE FUNCTION public.v4_invalidate_layout_on_roster_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='INSERT' OR OLD.active IS DISTINCT FROM NEW.active THEN
  IF NOT NEW.active THEN
   DELETE FROM public.v4_seats WHERE student_id=NEW.id AND school_year=NEW.school_year AND class_code=NEW.class_code;
  END IF;
  UPDATE public.v4_layouts SET is_confirmed=false,updated_at=now(),updated_by=auth.uid()
   WHERE school_year=NEW.school_year AND class_code=NEW.class_code;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.v4_invalidate_layout_on_roster_change() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.v4_save_student(y text,c text,code text,fullname text,sex text,born date,
 student uuid DEFAULT NULL,expected jsonb DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE current_row public.v4_students; saved public.v4_students;
BEGIN
 IF NOT public.v4_credentials_ready() OR NOT (public.v4_admin() OR public.v4_actual_homeroom(y,c)) THEN
  RAISE EXCEPTION 'Không có quyền quản lý học sinh lớp này' USING ERRCODE='42501';
 END IF;
 IF NOT coalesce(public.v4_school_year_valid(y),false) OR c IS NULL OR length(btrim(c)) NOT BETWEEN 1 AND 20 OR c<>btrim(c) THEN
  RAISE EXCEPTION 'Năm học hoặc lớp chưa hợp lệ';
 END IF;
 code=btrim(code);fullname=btrim(fullname);
 IF code IS NULL OR length(code) NOT BETWEEN 1 AND 50 OR code ~ '[[:cntrl:]]'
 OR fullname IS NULL OR length(fullname) NOT BETWEEN 2 AND 120 OR fullname ~ '[[:cntrl:]]'
 OR sex IS NULL OR sex NOT IN ('Nam','Nữ','Khác','Chưa rõ') THEN
  RAISE EXCEPTION 'Mã, họ tên hoặc giới tính học sinh chưa hợp lệ';
 END IF;
 IF born IS NOT NULL AND (born<DATE '1900-01-01' OR born>public.v4_school_today()) THEN
  RAISE EXCEPTION 'Ngày sinh chưa hợp lệ';
 END IF;
 IF student IS NULL THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(y||':'||lower(code),0));
  IF EXISTS(SELECT 1 FROM public.v4_students s WHERE s.school_year=y AND lower(s.student_code)=lower(code)) THEN
   RAISE EXCEPTION 'Mã học sinh đã có trong năm học; hãy kiểm tra cả danh sách đã xóa';
  END IF;
  INSERT INTO public.v4_students(school_year,class_code,student_code,full_name,gender,birth_date)
   VALUES(y,c,code,fullname,sex,born) RETURNING * INTO saved;
  INSERT INTO public.v4_audit(table_name,row_id,operation,old_row,new_row,changed_by)
   VALUES('v4_students',saved.id::text,'INSERT',NULL,to_jsonb(saved),auth.uid());
 ELSE
  SELECT * INTO current_row FROM public.v4_students s WHERE s.id=student AND s.school_year=y AND s.class_code=c FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy học sinh trong lớp này'; END IF;
  IF current_row.student_code<>code THEN RAISE EXCEPTION 'Không được thay mã học sinh đã có hồ sơ'; END IF;
  IF NOT current_row.active THEN RAISE EXCEPTION 'Hãy khôi phục học sinh trước khi sửa thông tin'; END IF;
  IF expected IS DISTINCT FROM jsonb_build_object('full_name',current_row.full_name,'gender',current_row.gender,'birth_date',current_row.birth_date,'active',current_row.active) THEN
   RAISE EXCEPTION 'Thông tin đã được người khác thay đổi. Hãy tải lại danh sách trước khi sửa';
  END IF;
  UPDATE public.v4_students SET full_name=fullname,gender=sex,birth_date=born WHERE id=student RETURNING * INTO saved;
 END IF;
 RETURN to_jsonb(saved);
END $$;
CREATE OR REPLACE FUNCTION public.v4_set_student_active(y text,c text,student uuid,enabled boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE current_row public.v4_students;
BEGIN
 IF NOT public.v4_credentials_ready() OR NOT (public.v4_admin() OR public.v4_actual_homeroom(y,c)) THEN
  RAISE EXCEPTION 'Không có quyền quản lý học sinh lớp này' USING ERRCODE='42501';
 END IF;
 IF enabled IS NULL OR NOT coalesce(public.v4_school_year_valid(y),false) THEN RAISE EXCEPTION 'Thông tin học sinh chưa hợp lệ'; END IF;
 SELECT * INTO current_row FROM public.v4_students s WHERE s.id=student AND s.school_year=y AND s.class_code=c FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy học sinh trong lớp này'; END IF;
 IF current_row.active IS DISTINCT FROM enabled THEN
  UPDATE public.v4_students SET active=enabled WHERE id=student RETURNING * INTO current_row;
 END IF;
 RETURN to_jsonb(current_row);
END $$;
REVOKE ALL ON FUNCTION public.v4_save_student(text,text,text,text,text,date,uuid,jsonb),
 public.v4_set_student_active(text,text,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.v4_save_student(text,text,text,text,text,date,uuid,jsonb),
 public.v4_set_student_active(text,text,uuid,boolean) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
