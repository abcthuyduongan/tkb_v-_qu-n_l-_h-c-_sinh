-- CAP NHAT TU26: SAO LUU truoc. Gop27/28/29; khong doi du lieu, so TKB hay ban dang ap dung.
BEGIN;
DO $guard$
BEGIN
 IF to_regclass('auth.users') IS NULL OR to_regprocedure('auth.uid()') IS NULL OR to_regprocedure('auth.jwt()') IS NULL THEN RAISE EXCEPTION 'Thieu Supabase Auth. Dung dung du an Supabase cua truong.'; END IF;
 IF to_regclass('public.tkb_versions') IS NULL OR to_regclass('public.tkb_entries') IS NULL OR to_regclass('public.tkb_assignments') IS NULL OR to_regprocedure('public.is_tkb_admin()') IS NULL THEN RAISE EXCEPTION 'Thieu schema TKB goc. Khong co du lieu hay schema gia trong bo cai nay.'; END IF;
END $guard$;
DO $guard$
 DECLARE signature text; required_table text; item record;
 BEGIN
  FOREACH required_table IN ARRAY ARRAY['v4_students','v4_observations','v4_sessions','v4_attendance','v4_teachers','v4_alert_actions','v4_lesson_reviews','v4_audit','v4_layouts','v4_seats','v4_tkb_sync_state'] LOOP
   IF to_regclass('public.'||required_table) IS NULL THEN RAISE EXCEPTION 'Can hoan tat module26 truoc SQL09: thieu bang %',required_table; END IF;
  END LOOP;
  FOREACH signature IN ARRAY ARRAY['public.v4_admin()','public.v4_credentials_ready()','public.v4_school_year_valid(text)','public.v4_school_today()','public.v4_actual_class_access(text,text)','public.v4_actual_homeroom(text,text)','public.v4_publish_timetable(text,text,boolean)','public.v4_preview_published_tkb()','public.v4_lesson_handoffs(text,text,date,date,text)'] LOOP
   IF to_regprocedure(signature) IS NULL THEN RAISE EXCEPTION 'Can hoan tat module26 truoc SQL09: thieu ham %',signature; END IF;
  END LOOP;
  FOR item IN SELECT * FROM (VALUES('tkb_versions','version_no'),('tkb_versions','effective_date'),('tkb_versions','updated_at'),('v4_sessions','scheduled_end_at'),('v4_sessions','timetable_version_id'),('v4_audit','new_row')) AS x(t,c) LOOP
   IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=item.t AND column_name=item.c) THEN RAISE EXCEPTION 'Can doi chieu schema truoc SQL09: thieu %.%',item.t,item.c; END IF;
  END LOOP;
  IF coalesce(position('linked-add-only' in pg_get_functiondef(to_regprocedure('public.v4_preview_published_tkb()'))),0)=0 OR
     coalesce(position('tuần hiện tại hoặc các tuần trước' in pg_get_functiondef(to_regprocedure('public.v4_lesson_handoffs(text,text,date,date,text)'))),0)=0 THEN
   RAISE EXCEPTION 'Can hoan tat SQL07/08 (module26) truoc SQL09';
  END IF;
 END $guard$;

-- SOURCE 27_v6_student_management.sql
-- Student roster maintenance. Keeps pupil IDs, lesson history and all tkb_* data.
-- Apply after26. No hard delete, transfer or grants to ordinary subject teachers.

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

-- SOURCE 28_v6_explicit_timetable_metadata.sql
-- Explicit timetable number/date, atomic draft imports, administrator-confirmed activation.
-- Apply after27. Does not renumber, remove or activate any existing timetable.

DO $guard$ BEGIN
 IF to_regprocedure('public.v4_publish_timetable(text,text,boolean)') IS NULL OR to_regprocedure('public.v4_school_today()') IS NULL
 OR to_regprocedure('public.v4_credentials_ready()') IS NULL OR to_regprocedure('public.v4_school_year_valid(text)') IS NULL
 OR NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='v4_audit' AND column_name='new_row') THEN
  RAISE EXCEPTION 'Cần hoàn tất module công bố TKB trước khi cập nhật';
 END IF;
END $guard$;
CREATE OR REPLACE FUNCTION public.v4_save_timetable_draft(meta jsonb,entries jsonb,assignments jsonb,
 target_version uuid DEFAULT NULL,expected_updated timestamptz DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE yr text; term text; num integer; applies date; school text; saved public.tkb_versions; existing public.tkb_versions;
BEGIN
 IF NOT public.v4_admin() THEN RAISE EXCEPTION 'Chỉ quản trị được nạp TKB' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(meta) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Thông tin TKB chưa hợp lệ'; END IF;
 yr=btrim(meta->>'school_year');term=btrim(meta->>'semester');school=btrim(meta->>'school_name');
 IF NOT coalesce(public.v4_school_year_valid(yr),false) OR term IS NULL OR term NOT IN ('Học kỳ 1','Học kỳ 2')
 OR school IS NULL OR length(school) NOT BETWEEN 1 AND 160 OR coalesce(meta->>'version_no','') !~ '^[0-9]{1,4}$'
 OR coalesce(meta->>'effective_date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
  RAISE EXCEPTION 'Nhập đầy đủ năm học, học kỳ, số TKB và ngày áp dụng';
 END IF;
 num=(meta->>'version_no')::integer;applies=(meta->>'effective_date')::date;
 IF num<1 OR applies NOT BETWEEN DATE '2000-01-01' AND DATE '2100-12-31' THEN RAISE EXCEPTION 'Số TKB hoặc ngày áp dụng chưa hợp lệ'; END IF;
 IF jsonb_typeof(entries) IS DISTINCT FROM 'array' OR jsonb_array_length(entries) NOT BETWEEN 1 AND 10000
 OR jsonb_typeof(assignments) IS DISTINCT FROM 'array' OR jsonb_array_length(assignments)>1500 THEN RAISE EXCEPTION 'Dữ liệu TKB/PCCM chưa hợp lệ'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_to_recordset(entries) AS x(day_no integer,period_no integer,class_code text,subject text,teacher_name text)
  WHERE day_no IS NULL OR day_no NOT BETWEEN 2 AND 7 OR period_no IS NULL OR period_no NOT BETWEEN 1 AND 5
  OR coalesce(length(btrim(class_code)),0) NOT BETWEEN 1 AND 20 OR coalesce(length(btrim(subject)),0) NOT BETWEEN 1 AND 200
  OR coalesce(length(btrim(teacher_name)),0) NOT BETWEEN 2 AND 120) THEN RAISE EXCEPTION 'Dòng TKB thiếu lớp/môn/giáo viên hoặc sai thứ, tiết'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_to_recordset(entries) AS x(day_no integer,period_no integer,class_code text) GROUP BY day_no,period_no,class_code HAVING count(*)>1) THEN RAISE EXCEPTION 'TKB trùng thứ, tiết và lớp'; END IF;
 PERFORM pg_advisory_xact_lock(7642026);
 IF target_version IS NOT NULL THEN
  SELECT * INTO existing FROM public.tkb_versions WHERE id=target_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy bản nháp TKB'; END IF;
  IF existing.status<>'draft' OR existing.is_active OR existing.published_at IS NOT NULL
   OR EXISTS(SELECT 1 FROM public.v4_sessions WHERE timetable_version_id=existing.id::text) THEN RAISE EXCEPTION 'Chỉ thay dữ liệu bản nháp chưa từng áp dụng; TKB đã dùng cần số mới'; END IF;
  IF existing.updated_at IS DISTINCT FROM expected_updated THEN RAISE EXCEPTION 'Bản nháp đã thay đổi; hãy làm mới trước khi nạp lại'; END IF;
  IF existing.school_year IS DISTINCT FROM yr OR existing.semester IS DISTINCT FROM term THEN RAISE EXCEPTION 'Cần đối chiếu năm học/học kỳ cũ trước khi nạp lại bản nháp'; END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM public.tkb_versions v WHERE v.id IS DISTINCT FROM target_version
  AND regexp_replace(v.school_year,'[[:space:]–—-]','','g')=replace(yr,'-','')
  AND btrim(v.semester)=term AND v.version_no=num) THEN RAISE EXCEPTION 'Số TKB đã có trong năm học và học kỳ này; mở bản đã có hoặc chọn số khác'; END IF;
 IF target_version IS NULL THEN
  INSERT INTO public.tkb_versions(version_no,version_name,school_name,school_year,semester,effective_date,status,is_active)
   VALUES(num,'Số '||num,school,yr,term,applies,'draft',false) RETURNING * INTO saved;
 ELSE
  UPDATE public.tkb_versions SET version_no=num,version_name='Số '||num,school_name=school,school_year=yr,semester=term,effective_date=applies WHERE id=target_version RETURNING * INTO saved;
  DELETE FROM public.tkb_entries WHERE version_id=saved.id;
  DELETE FROM public.tkb_assignments WHERE version_id=saved.id;
 END IF;
 INSERT INTO public.tkb_entries(version_id,day_no,period_no,class_code,subject,teacher_code,teacher_name,homeroom_teacher,status)
 SELECT saved.id,x.day_no,x.period_no,btrim(x.class_code),btrim(x.subject),coalesce(x.teacher_code,''),btrim(x.teacher_name),coalesce(x.homeroom_teacher,''),coalesce(nullif(x.status,''),'Học')
 FROM jsonb_to_recordset(entries) AS x(day_no integer,period_no integer,class_code text,subject text,teacher_code text,teacher_name text,homeroom_teacher text,status text);
 INSERT INTO public.tkb_assignments(version_id,ordinal,teacher_name,duty,homeroom_class,teaching_assignment,period_count)
 SELECT saved.id,x.ordinal,x.teacher_name,coalesce(x.duty,''),coalesce(x.homeroom_class,''),coalesce(x.teaching_assignment,''),x.period_count
 FROM jsonb_to_recordset(assignments) AS x(ordinal integer,teacher_name text,duty text,homeroom_class text,teaching_assignment text,period_count integer);
 RETURN jsonb_build_object('version',to_jsonb(saved),'entries',jsonb_array_length(entries),'assignments',jsonb_array_length(assignments));
END $$;
CREATE OR REPLACE FUNCTION public.v4_set_timetable_metadata(target_version uuid,num integer,applies date,expected_updated timestamptz) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE target public.tkb_versions; before_row jsonb;
BEGIN
 IF NOT public.v4_admin() THEN RAISE EXCEPTION 'Chỉ quản trị được sửa thông tin TKB' USING ERRCODE='42501'; END IF;
 IF num IS NULL OR num NOT BETWEEN 1 AND 9999 OR applies IS NULL OR applies NOT BETWEEN DATE '2000-01-01' AND DATE '2100-12-31' THEN RAISE EXCEPTION 'Số TKB hoặc ngày áp dụng chưa hợp lệ'; END IF;
 PERFORM pg_advisory_xact_lock(7642026);
 SELECT * INTO target FROM public.tkb_versions WHERE id=target_version FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy bản TKB'; END IF;
 IF target.updated_at IS DISTINCT FROM expected_updated THEN RAISE EXCEPTION 'TKB đã thay đổi; hãy làm mới trước khi sửa'; END IF;
 IF target.is_active AND applies>public.v4_school_today() THEN RAISE EXCEPTION 'TKB đang áp dụng không được đổi sang ngày tương lai'; END IF;
 IF EXISTS(SELECT 1 FROM public.tkb_versions v WHERE v.id<>target.id
  AND regexp_replace(v.school_year,'[[:space:]–—-]','','g')=regexp_replace(target.school_year,'[[:space:]–—-]','','g')
  AND btrim(v.semester)=btrim(target.semester) AND v.version_no=num) THEN RAISE EXCEPTION 'Số TKB đã có trong năm học và học kỳ này'; END IF;
 before_row=to_jsonb(target);
 UPDATE public.tkb_versions SET version_no=num,version_name='Số '||num,effective_date=applies WHERE id=target.id RETURNING * INTO target;
 INSERT INTO public.v4_audit(table_name,row_id,operation,old_row,new_row,changed_by) VALUES('tkb_versions',target.id::text,'UPDATE',before_row,to_jsonb(target),auth.uid());
 RETURN to_jsonb(target);
END $$;
REVOKE ALL ON FUNCTION public.v4_save_timetable_draft(jsonb,jsonb,jsonb,uuid,timestamptz),public.v4_set_timetable_metadata(uuid,integer,date,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.v4_save_timetable_draft(jsonb,jsonb,jsonb,uuid,timestamptz),public.v4_set_timetable_metadata(uuid,integer,date,timestamptz) TO authenticated;
CREATE OR REPLACE FUNCTION public.v4_publish_timetable(target_version text,expected_current text,sync_permissions boolean DEFAULT true) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE target public.tkb_versions%rowtype; current_id text; result jsonb;
BEGIN
 IF NOT public.v4_admin() THEN RAISE EXCEPTION 'Chỉ quản trị được công bố TKB'; END IF;
 PERFORM pg_advisory_xact_lock(7642026);
 SELECT id::text INTO current_id FROM public.tkb_versions WHERE is_active LIMIT 1 FOR UPDATE;
 IF current_id IS DISTINCT FROM nullif(expected_current,'') THEN RAISE EXCEPTION 'TKB đang dùng đã thay đổi; hãy làm mới trước khi công bố'; END IF;
 SELECT * INTO target FROM public.tkb_versions WHERE id::text=target_version FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy bản TKB'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.tkb_entries WHERE version_id=target.id) THEN RAISE EXCEPTION 'TKB chưa có tiết học'; END IF;
 IF target.version_no IS NULL OR target.version_no<1 OR target.effective_date IS NULL THEN RAISE EXCEPTION 'Cần xác nhận số TKB và ngày áp dụng trước khi áp dụng'; END IF;
 IF target.effective_date>public.v4_school_today() THEN RAISE EXCEPTION 'TKB chưa đến ngày áp dụng; bản đang dùng được giữ nguyên'; END IF;
 UPDATE public.tkb_versions SET is_active=false WHERE is_active;
 UPDATE public.tkb_versions SET status='published',is_active=true,published_at=now() WHERE id=target.id;
 IF sync_permissions THEN
  -- A malformed PCCM cannot silently change any permissions. The schedule remains
  -- available while Admin resolves the explicit pending state.
  BEGIN result=public.v4_apply_tkb_preview(target.id::text);
  EXCEPTION WHEN OTHERS THEN
   result=jsonb_build_object('applied',false,'reason',SQLERRM,'added',0,'removed',0);
   INSERT INTO public.v4_tkb_sync_state(version_id,status,reason,updated_by) VALUES(target.id,'pending',SQLERRM,auth.uid())
   ON CONFLICT(version_id) DO UPDATE SET status='pending',reason=excluded.reason,updated_at=now(),updated_by=auth.uid();
  END;
 ELSE
  result=jsonb_build_object('applied',false,'reason','Chờ quản trị xác nhận quyền','added',0,'removed',0);
  INSERT INTO public.v4_tkb_sync_state(version_id,status,reason,updated_by) VALUES(target.id,'pending','Chờ quản trị xác nhận quyền',auth.uid())
  ON CONFLICT(version_id) DO UPDATE SET status='pending',reason=excluded.reason,updated_at=now(),updated_by=auth.uid();
 END IF;
 RETURN jsonb_build_object('published',true,'version_id',target.id,'sync',result);
END $$;
REVOKE ALL ON FUNCTION public.v4_publish_timetable(text,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v4_publish_timetable(text,text,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.v4_activate_timetable(target_version uuid,expected_updated timestamptz,expected_current text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE target public.tkb_versions;
BEGIN
 IF NOT public.v4_admin() THEN RAISE EXCEPTION 'Chỉ quản trị được áp dụng TKB' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(7642026);
 SELECT * INTO target FROM public.tkb_versions WHERE id=target_version FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy bản TKB'; END IF;
 IF expected_updated IS NULL OR target.updated_at IS DISTINCT FROM expected_updated THEN RAISE EXCEPTION 'TKB đã thay đổi; hãy làm mới và kiểm tra trước khi áp dụng'; END IF;
 RETURN public.v4_publish_timetable(target_version::text,expected_current,true);
END $$;
REVOKE ALL ON FUNCTION public.v4_activate_timetable(uuid,timestamptz,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.v4_activate_timetable(uuid,timestamptz,text) TO authenticated;
NOTIFY pgrst,'reload schema';

-- SOURCE 29_v6_lesson_learning_highlights.sql
-- Add grouped learning highlights to the existing read-only lesson handoff.
-- Apply after28. No table/data/write-policy changes; no health/support or free-text pupil notes.

DO $guard$ BEGIN
 IF to_regprocedure('public.v4_activate_timetable(uuid,timestamptz,text)') IS NULL OR
    to_regprocedure('public.v4_lesson_handoffs(text,text,date,date,text)') IS NULL THEN
  RAISE EXCEPTION 'Cần hoàn tất cập nhật28 trước khi thêm thông tin các tiết trước';
 END IF;
END $guard$;
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
 ), learning_members AS (
  SELECT DISTINCT o.session_id,o.category,btrim(o.behavior_code) AS behavior_code,
   st.id AS student_id,st.full_name,st.student_code
  FROM public.v4_observations o JOIN lessons l ON l.id=o.session_id
   JOIN public.v4_students st ON st.id=o.student_id AND st.school_year=y AND st.class_code=cls
  WHERE o.school_year=y AND o.class_code=cls AND o.category IN('positive','concern')
 ), learning_groups AS (
  SELECT session_id,category,behavior_code,
   jsonb_agg(jsonb_build_object('student_id',student_id,'full_name',full_name,'student_code',student_code)
    ORDER BY full_name,student_code,student_id) AS students
  FROM learning_members GROUP BY session_id,category,behavior_code
 ), learning_highlights AS (
  SELECT session_id,jsonb_agg(jsonb_build_object('category',category,'behavior_code',behavior_code,'students',students)
   ORDER BY CASE category WHEN 'concern' THEN 0 ELSE 1 END,behavior_code) AS groups
  FROM learning_groups GROUP BY session_id
 ), facts AS(
  SELECT l.*,coalesce(a.confirmed,0) AS confirmed,coalesce(a.present,0) AS present,
   coalesce(a.absent,0) AS absent,coalesce(a.late,0) AS late,coalesce(a.excused,0) AS excused,
   coalesce(o.positive,0) AS positive,coalesce(o.concern,0) AS concern,
   greatest(a.updated_at,o.updated_at) AS facts_updated_at,r.id AS review_id,r.note AS teacher_note,r.confirmed_at,coalesce(h.groups,'[]'::jsonb) AS learning_groups
  FROM lessons l LEFT JOIN attendance a ON a.session_id=l.id LEFT JOIN observations o ON o.session_id=l.id
   LEFT JOIN public.v4_lesson_reviews r ON r.session_id=l.id
   LEFT JOIN learning_highlights h ON h.session_id=l.id
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',f.id,'session_id',f.id,'school_year',f.school_year,'class_code',f.class_code,'lesson_date',f.lesson_date,
  'period_no',f.period_no,'subject',f.subject,'teacher_id',f.teacher_id,'teacher_name',f.teacher_name,
  'source',CASE WHEN f.review_id IS NOT NULL THEN 'teacher' ELSE 'system' END,
  'source_label',CASE WHEN f.review_id IS NOT NULL THEN 'Giáo viên đã xác nhận' ELSE 'Tổng hợp hệ thống' END,
  'stage',CASE WHEN f.ended_at IS NOT NULL OR f.scheduled_end_at<=statement_timestamp() THEN 'final' WHEN f.scheduled_end_at IS NULL THEN 'unknown' ELSE 'in_progress' END,
  'scheduled_end_at',f.scheduled_end_at,'confirmed_at',f.confirmed_at,'generated_at',statement_timestamp(),
  'facts_updated_at',f.facts_updated_at,'review_id',f.review_id,'learning_groups',f.learning_groups,
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

NOTIFY pgrst,'reload schema';
COMMIT;
