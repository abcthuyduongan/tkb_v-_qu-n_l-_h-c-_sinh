-- Explicit timetable number/date, atomic draft imports, administrator-confirmed activation.
-- Apply after27. Does not renumber, remove or activate any existing timetable.
BEGIN;
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
COMMIT;
