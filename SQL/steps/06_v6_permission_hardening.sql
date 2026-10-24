-- V6: fixes found by executable offline PostgreSQL/RLS tests.
-- Apply after 01, 03 and 05. Does not change tkb_* tables or their policies.
BEGIN;

-- Ownership alone must never keep writing privileges after a class grant is revoked.
CREATE OR REPLACE FUNCTION public.v4_session_owner(s uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.v4_sessions x WHERE x.id=s
   AND x.teacher_id=auth.uid()
   AND public.v4_actual_class_access(x.school_year,x.class_code))
$$;
CREATE OR REPLACE FUNCTION public.v4_check_lesson_writable(sess uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.v4_sessions x WHERE x.id=sess
   AND x.teacher_id=auth.uid() AND x.ended_at IS NULL
   AND public.v4_actual_class_access(x.school_year,x.class_code))
$$;
DROP POLICY IF EXISTS v4_session_edit ON public.v4_sessions;
CREATE POLICY v4_session_edit ON public.v4_sessions FOR UPDATE TO authenticated
 USING(teacher_id=auth.uid() AND public.v4_actual_class_access(school_year,class_code))
 WITH CHECK(teacher_id=auth.uid() AND public.v4_actual_class_access(school_year,class_code));

-- The creator also needs current access: SECURITY DEFINER must not bypass revocation.
CREATE OR REPLACE FUNCTION public.v4_observation_edit_history(ob uuid)
RETURNS TABLE(changed_at timestamptz,old_note text,changed_by uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(
  SELECT 1 FROM public.v4_observations o WHERE o.id=ob
   AND public.v4_actual_class_access(o.school_year,o.class_code)
   AND (o.created_by=auth.uid() OR public.v4_actual_homeroom(o.school_year,o.class_code))
   AND (o.category<>'health' OR public.v4_health_access(o.school_year,o.class_code))
 ) THEN RAISE EXCEPTION 'Không có quyền xem lịch sử chỉnh sửa'; END IF;
 RETURN QUERY SELECT a.changed_at,a.old_row->>'note',a.changed_by FROM public.v4_audit a
  WHERE a.table_name='v4_observations' AND a.row_id=ob::text
  ORDER BY a.changed_at DESC,a.id DESC LIMIT 100;
END $$;

-- Timetable evidence must also match the requested school year.
CREATE OR REPLACE FUNCTION public.v4_verify_session() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE tcode text;
BEGIN
 IF NEW.source='tkb' THEN
  IF NEW.timetable_version_id IS NULL THEN RAISE EXCEPTION 'Chưa xác định bản thời khóa biểu'; END IF;
  SELECT teacher_code INTO tcode FROM public.v4_teachers WHERE user_id=NEW.teacher_id;
  IF tcode IS NULL OR NOT EXISTS(
   SELECT 1 FROM public.tkb_entries e JOIN public.tkb_versions v ON v.id=e.version_id
   WHERE e.version_id::text=NEW.timetable_version_id AND v.status='published' AND v.is_active=true
    AND v.school_year=NEW.school_year AND e.teacher_code=tcode AND e.class_code=NEW.class_code
    AND e.period_no=NEW.period_no AND e.day_no=extract(isodow FROM NEW.lesson_date)::integer+1
    AND e.subject=NEW.subject
  ) THEN RAISE EXCEPTION 'Tiết này không khớp TKB/năm học của giáo viên. Chọn chế độ dạy thay/thủ công và ghi lý do.'; END IF;
 ELSE
  IF length(btrim(NEW.override_reason))<10 THEN
   RAISE EXCEPTION 'Cần ghi lý do ít nhất 10 ký tự khi dạy thay/chọn thủ công';
  END IF;
 END IF;
 RETURN NEW;
END $$;

-- Approval metadata is server generated and immutable while an approval stays valid.
CREATE OR REPLACE FUNCTION public.v4_layout_approval_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE total_students integer; total_seated integer; invalid_positions integer; needs_approval boolean;
BEGIN
 IF TG_OP='INSERT' THEN needs_approval=NEW.is_confirmed;
 ELSE
  IF row(NEW.school_year,NEW.class_code) IS DISTINCT FROM row(OLD.school_year,OLD.class_code) THEN
   RAISE EXCEPTION 'Không được thay đổi năm học hoặc lớp của sơ đồ';
  END IF;
  IF NEW.desk_counts IS DISTINCT FROM OLD.desk_counts THEN NEW.is_confirmed=false; END IF;
  needs_approval=NEW.is_confirmed AND NOT OLD.is_confirmed;
 END IF;
 IF needs_approval THEN
  IF NOT public.v4_actual_homeroom(NEW.school_year,NEW.class_code) THEN
   RAISE EXCEPTION 'Chỉ GVCN được chốt sơ đồ';
  END IF;
  SELECT count(*) INTO total_students FROM public.v4_students
   WHERE school_year=NEW.school_year AND class_code=NEW.class_code AND active;
  SELECT count(*) INTO total_seated FROM public.v4_seats a JOIN public.v4_students s ON s.id=a.student_id
   WHERE a.school_year=NEW.school_year AND a.class_code=NEW.class_code AND s.active;
  SELECT count(*) INTO invalid_positions FROM public.v4_seats a
   WHERE a.school_year=NEW.school_year AND a.class_code=NEW.class_code
    AND (a.group_no<1 OR a.group_no>jsonb_array_length(NEW.desk_counts)
     OR a.desk_no>coalesce((NEW.desk_counts->>(a.group_no-1))::integer,0));
  IF total_students=0 OR total_seated<>total_students OR invalid_positions>0 THEN
   RAISE EXCEPTION 'Phải xếp đủ học sinh vào các bàn hợp lệ trước khi chốt (%/% học sinh)',total_seated,total_students;
  END IF;
  NEW.confirmed_at=now(); NEW.confirmed_by=auth.uid();
 ELSIF NOT NEW.is_confirmed THEN
  NEW.confirmed_at=NULL; NEW.confirmed_by=NULL;
 ELSE
  NEW.confirmed_at=OLD.confirmed_at; NEW.confirmed_by=OLD.confirmed_by;
 END IF;
 NEW.updated_by=auth.uid(); NEW.updated_at=now();
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS v4_guard_layout_approval ON public.v4_layouts;
CREATE TRIGGER v4_guard_layout_approval BEFORE INSERT OR UPDATE ON public.v4_layouts
 FOR EACH ROW EXECUTE FUNCTION public.v4_layout_approval_guard();
CREATE OR REPLACE FUNCTION public.v4_lock_seat_class() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF row(NEW.school_year,NEW.class_code) IS DISTINCT FROM row(OLD.school_year,OLD.class_code) THEN
  RAISE EXCEPTION 'Không được chuyển vị trí sang sơ đồ của lớp khác';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS v4_lock_seat_class ON public.v4_seats;
CREATE TRIGGER v4_lock_seat_class BEFORE UPDATE ON public.v4_seats
 FOR EACH ROW EXECUTE FUNCTION public.v4_lock_seat_class();

-- Linking an email must only target an account that has proved control of that email.
CREATE OR REPLACE FUNCTION public.v4_admin_link_teacher(em text,code text,fullname text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid;
BEGIN
 IF NOT public.v4_admin() THEN RAISE EXCEPTION 'Chỉ quản trị được liên kết giáo viên'; END IF;
 IF length(btrim(coalesce(code,'')))<1 OR length(btrim(coalesce(fullname,'')))<2 THEN
  RAISE EXCEPTION 'Thiếu mã hoặc họ tên giáo viên';
 END IF;
 SELECT id INTO uid FROM auth.users WHERE lower(email)=lower(btrim(em)) AND email_confirmed_at IS NOT NULL;
 IF uid IS NULL THEN RAISE EXCEPTION 'Email chưa có tài khoản Supabase Auth đã xác nhận'; END IF;
 INSERT INTO public.v4_teachers(user_id,teacher_code,teacher_name) VALUES(uid,btrim(code),btrim(fullname))
  ON CONFLICT(user_id) DO UPDATE SET teacher_code=excluded.teacher_code,teacher_name=excluded.teacher_name;
 RETURN uid::text;
END $$;
CREATE OR REPLACE FUNCTION public.v4_admin_bind_teacher(em text,code text,fullname text,year text,cls text,job text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid;
BEGIN
 IF NOT public.v4_admin() THEN RAISE EXCEPTION 'Chỉ quản trị được cấp quyền'; END IF;
 IF job IS NULL OR job NOT IN('gvbm','gvcn') OR length(btrim(coalesce(year,'')))<7 OR length(btrim(coalesce(cls,'')))<1 THEN
  RAISE EXCEPTION 'Thông tin chưa hợp lệ';
 END IF;
 uid=public.v4_admin_link_teacher(em,code,fullname)::uuid;
 INSERT INTO public.v4_class_access(user_id,school_year,class_code,role)
  VALUES(uid,btrim(year),btrim(cls),job) ON CONFLICT DO NOTHING;
 RETURN uid::text;
END $$;

-- Track grants/revocations and identity changes without exposing the audit table to clients.
ALTER TABLE public.v4_audit ADD COLUMN IF NOT EXISTS operation text NOT NULL DEFAULT 'UPDATE';
ALTER TABLE public.v4_audit ADD COLUMN IF NOT EXISTS new_row jsonb;
CREATE OR REPLACE FUNCTION public.v4_audit_permission_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE before_row jsonb; after_row jsonb; key_row jsonb;
BEGIN
 IF TG_OP<>'INSERT' THEN before_row=to_jsonb(OLD); END IF;
 IF TG_OP<>'DELETE' THEN after_row=to_jsonb(NEW); END IF;
 key_row=coalesce(after_row,before_row);
 INSERT INTO public.v4_audit(table_name,row_id,old_row,new_row,operation,changed_by)
  VALUES(TG_TABLE_NAME,concat_ws('|',key_row->>'user_id',key_row->>'school_year',key_row->>'class_code',key_row->>'role'),
   before_row,after_row,TG_OP,auth.uid());
 -- A manual homeroom change needs the same fresh confirmation as a TKB sync.
 IF TG_TABLE_NAME='v4_class_access' THEN
  IF before_row->>'role'='gvcn' THEN
   UPDATE public.v4_layouts SET is_confirmed=false
    WHERE school_year=before_row->>'school_year' AND class_code=before_row->>'class_code';
  END IF;
  IF after_row->>'role'='gvcn' THEN
   UPDATE public.v4_layouts SET is_confirmed=false
    WHERE school_year=after_row->>'school_year' AND class_code=after_row->>'class_code';
  END IF;
 END IF;
 RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS v4_audit_access ON public.v4_class_access;
CREATE TRIGGER v4_audit_access AFTER INSERT OR UPDATE OR DELETE ON public.v4_class_access
 FOR EACH ROW EXECUTE FUNCTION public.v4_audit_permission_change();
DROP TRIGGER IF EXISTS v4_audit_teacher_binding ON public.v4_teachers;
CREATE TRIGGER v4_audit_teacher_binding AFTER INSERT OR UPDATE OR DELETE ON public.v4_teachers
 FOR EACH ROW EXECUTE FUNCTION public.v4_audit_permission_change();

REVOKE ALL ON FUNCTION public.v4_audit_permission_change() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.v4_lock_seat_class() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.v4_session_owner(uuid),public.v4_check_lesson_writable(uuid),
 public.v4_observation_edit_history(uuid),public.v4_admin_link_teacher(text,text,text),
 public.v4_admin_bind_teacher(text,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v4_session_owner(uuid),public.v4_check_lesson_writable(uuid),
 public.v4_observation_edit_history(uuid),public.v4_admin_link_teacher(text,text,text),
 public.v4_admin_bind_teacher(text,text,text,text,text,text) TO authenticated;
COMMIT;
