-- V6 incremental migration. Run AFTER 01_v4_new_module.sql on a staging clone.
-- No ALTER/DROP of tkb_* tables; reads published TKB only.
BEGIN;
ALTER TABLE public.v4_layouts ADD COLUMN IF NOT EXISTS is_confirmed boolean NOT NULL DEFAULT false;
ALTER TABLE public.v4_layouts ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;
ALTER TABLE public.v4_layouts ADD COLUMN IF NOT EXISTS confirmed_by uuid REFERENCES auth.users(id);

-- Existing pre-V6 layouts MUST start pending: no retroactive approval.
CREATE OR REPLACE FUNCTION public.v4_layout_approval_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE total_students integer; total_seated integer; invalid_positions integer; needs_approval boolean:=false;
BEGIN
 IF TG_OP='INSERT' THEN
  needs_approval=NEW.is_confirmed;
 ELSE
  IF NEW.desk_counts IS DISTINCT FROM OLD.desk_counts THEN
   NEW.is_confirmed=false;
  END IF;
  needs_approval=NEW.is_confirmed AND NOT OLD.is_confirmed;
 END IF;
 IF needs_approval THEN
  IF NOT public.v4_actual_homeroom(NEW.school_year,NEW.class_code) THEN
   RAISE EXCEPTION 'Chỉ GVCN được chốt sơ đồ';
  END IF;
  SELECT count(*) INTO total_students FROM public.v4_students
    WHERE school_year=NEW.school_year AND class_code=NEW.class_code AND active;
  SELECT count(*) INTO total_seated FROM public.v4_seats a
    JOIN public.v4_students s ON s.id=a.student_id
    WHERE a.school_year=NEW.school_year AND a.class_code=NEW.class_code AND s.active;
  SELECT count(*) INTO invalid_positions FROM public.v4_seats a
    WHERE a.school_year=NEW.school_year AND a.class_code=NEW.class_code
      AND a.desk_no>(NEW.desk_counts->>(a.group_no-1))::integer;
  IF total_students=0 OR total_seated<>total_students OR invalid_positions>0 THEN
   RAISE EXCEPTION 'Phải xếp đủ học sinh vào các bàn hợp lệ trước khi chốt (%/% học sinh)',total_seated,total_students;
  END IF;
  NEW.confirmed_at=now(); NEW.confirmed_by=auth.uid();
 ELSIF NOT NEW.is_confirmed THEN
  NEW.confirmed_at=NULL; NEW.confirmed_by=NULL;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS v4_guard_layout_approval ON public.v4_layouts;
CREATE TRIGGER v4_guard_layout_approval BEFORE INSERT OR UPDATE OF is_confirmed,desk_counts ON public.v4_layouts
 FOR EACH ROW EXECUTE FUNCTION public.v4_layout_approval_guard();

-- Any rearrangement automatically requires a fresh homeroom confirmation.
CREATE OR REPLACE FUNCTION public.v4_invalidate_layout_on_seat_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE public.v4_layouts SET is_confirmed=false,updated_at=now(),updated_by=auth.uid()
 WHERE school_year=CASE WHEN TG_OP='DELETE' THEN OLD.school_year ELSE NEW.school_year END
   AND class_code=CASE WHEN TG_OP='DELETE' THEN OLD.class_code ELSE NEW.class_code END;
 RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS v4_invalidate_on_seat_change ON public.v4_seats;
CREATE TRIGGER v4_invalidate_on_seat_change AFTER INSERT OR UPDATE OR DELETE ON public.v4_seats
 FOR EACH ROW EXECUTE FUNCTION public.v4_invalidate_layout_on_seat_change();

-- New/activated students make an old approved layout incomplete.
CREATE OR REPLACE FUNCTION public.v4_invalidate_layout_on_roster_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='INSERT' OR (TG_OP='UPDATE' AND OLD.active IS DISTINCT FROM NEW.active) THEN
  UPDATE public.v4_layouts SET is_confirmed=false,updated_at=now()
   WHERE school_year=NEW.school_year AND class_code=NEW.class_code;
 END IF;
 RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS v4_invalidate_on_roster_change ON public.v4_students;
CREATE TRIGGER v4_invalidate_on_roster_change AFTER INSERT OR UPDATE OF active ON public.v4_students
 FOR EACH ROW EXECUTE FUNCTION public.v4_invalidate_layout_on_roster_change();

-- Replace legacy policies that treated an Admin as GVCN.
DROP POLICY IF EXISTS v4_layout_manage ON public.v4_layouts;
DROP POLICY IF EXISTS v4_layout_edit ON public.v4_layouts;
DROP POLICY IF EXISTS v4_seat_add ON public.v4_seats;
DROP POLICY IF EXISTS v4_seat_edit ON public.v4_seats;
DROP POLICY IF EXISTS v4_seat_delete ON public.v4_seats;
CREATE POLICY v4_layout_manage ON public.v4_layouts FOR INSERT TO authenticated
 WITH CHECK(public.v4_actual_homeroom(school_year,class_code));
CREATE POLICY v4_layout_edit ON public.v4_layouts FOR UPDATE TO authenticated
 USING(public.v4_actual_homeroom(school_year,class_code))
 WITH CHECK(public.v4_actual_homeroom(school_year,class_code));
CREATE POLICY v4_seat_add ON public.v4_seats FOR INSERT TO authenticated
 WITH CHECK(public.v4_actual_homeroom(school_year,class_code));
CREATE POLICY v4_seat_edit ON public.v4_seats FOR UPDATE TO authenticated
 USING(public.v4_actual_homeroom(school_year,class_code))
 WITH CHECK(public.v4_actual_homeroom(school_year,class_code));
CREATE POLICY v4_seat_delete ON public.v4_seats FOR DELETE TO authenticated
 USING(public.v4_actual_homeroom(school_year,class_code));

-- No admin exception for seat management. Admin manages system, not classroom seating.
CREATE OR REPLACE FUNCTION public.v4_assign_seat(y text,c text,g integer,d integer,s integer,st uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer;
BEGIN
 IF NOT public.v4_actual_homeroom(y,c) THEN RAISE EXCEPTION 'Chỉ GVCN được xếp chỗ'; END IF;
 IF g NOT BETWEEN 1 AND 4 OR d<1 OR s NOT IN (1,2) THEN RAISE EXCEPTION 'Vị trí không hợp lệ'; END IF;
 SELECT (desk_counts->>(g-1))::integer INTO n FROM public.v4_layouts WHERE school_year=y AND class_code=c FOR UPDATE;
 IF n IS NULL OR d>n THEN RAISE EXCEPTION 'Chưa thiết lập bàn hợp lệ'; END IF;
 IF st IS NOT NULL AND NOT public.v4_student_class(st,y,c) THEN RAISE EXCEPTION 'Học sinh không thuộc lớp'; END IF;
 IF st IS NOT NULL THEN DELETE FROM public.v4_seats WHERE school_year=y AND class_code=c AND student_id=st; END IF;
 DELETE FROM public.v4_seats WHERE school_year=y AND class_code=c AND group_no=g AND desk_no=d AND seat_no=s;
 IF st IS NOT NULL THEN INSERT INTO public.v4_seats(school_year,class_code,group_no,desk_no,seat_no,student_id)
 VALUES(y,c,g,d,s,st); END IF;
END $$;
CREATE OR REPLACE FUNCTION public.v4_set_desks(y text,c text,g integer,n integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.v4_actual_homeroom(y,c) THEN RAISE EXCEPTION 'Chỉ GVCN được thêm/bớt bàn'; END IF;
 IF g NOT BETWEEN 1 AND 4 OR n NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'Số bàn không hợp lệ'; END IF;
 INSERT INTO public.v4_layouts(school_year,class_code,updated_by)
 VALUES(y,c,auth.uid()) ON CONFLICT(school_year,class_code) DO NOTHING;
 UPDATE public.v4_layouts SET desk_counts=jsonb_set(desk_counts,ARRAY[(g-1)::text],to_jsonb(n)),
 is_confirmed=false,updated_at=now(),updated_by=auth.uid()
 WHERE school_year=y AND class_code=c;
 DELETE FROM public.v4_seats WHERE school_year=y AND class_code=c AND group_no=g AND desk_no>n;
END $$;
CREATE OR REPLACE FUNCTION public.v4_confirm_layout(y text,c text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.v4_actual_homeroom(y,c) THEN RAISE EXCEPTION 'Chỉ GVCN được chốt sơ đồ'; END IF;
 UPDATE public.v4_layouts SET is_confirmed=true,updated_at=now(),updated_by=auth.uid()
 WHERE school_year=y AND class_code=c;
 IF NOT FOUND THEN RAISE EXCEPTION 'Chưa có sơ đồ để chốt'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.v4_confirm_layout(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v4_confirm_layout(text,text) TO authenticated;

-- Administrative visibility is not a license to teach a lesson or create student notes.
CREATE OR REPLACE FUNCTION public.v4_actual_class_access(y text,c text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS(
  SELECT 1 FROM public.v4_class_access WHERE user_id=auth.uid()
    AND school_year=y AND class_code=c
 )
$$;
REVOKE ALL ON FUNCTION public.v4_actual_class_access(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v4_actual_class_access(text,text) TO authenticated;
DROP POLICY IF EXISTS v4_session_create ON public.v4_sessions;
CREATE POLICY v4_session_create ON public.v4_sessions FOR INSERT TO authenticated
 WITH CHECK(teacher_id=auth.uid() AND public.v4_actual_class_access(school_year,class_code));
DROP POLICY IF EXISTS v4_obs_add ON public.v4_observations;
CREATE POLICY v4_obs_add ON public.v4_observations FOR INSERT TO authenticated
 WITH CHECK(created_by=auth.uid() AND public.v4_actual_class_access(school_year,class_code));
DROP POLICY IF EXISTS v4_obs_edit ON public.v4_observations;
CREATE POLICY v4_obs_edit ON public.v4_observations FOR UPDATE TO authenticated
 USING(created_by=auth.uid() AND public.v4_actual_class_access(school_year,class_code))
 WITH CHECK(created_by=auth.uid() AND public.v4_actual_class_access(school_year,class_code));

-- Link a verified Auth account to a TKB teacher identity WITHOUT granting a class.
-- Class permissions are created only by the separate reviewed TKB sync step.
CREATE OR REPLACE FUNCTION public.v4_admin_link_teacher(em text,code text,fullname text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid;
BEGIN
 IF NOT public.v4_admin() THEN RAISE EXCEPTION 'Chỉ quản trị được liên kết giáo viên'; END IF;
 IF length(btrim(code))<1 OR length(btrim(fullname))<2 THEN RAISE EXCEPTION 'Thiếu mã hoặc họ tên giáo viên'; END IF;
 SELECT id INTO uid FROM auth.users WHERE lower(email)=lower(btrim(em)) LIMIT 1;
 IF uid IS NULL THEN RAISE EXCEPTION 'Email chưa có tài khoản Supabase Auth'; END IF;
 INSERT INTO public.v4_teachers(user_id,teacher_code,teacher_name)
 VALUES(uid,btrim(code),btrim(fullname))
 ON CONFLICT(user_id) DO UPDATE SET teacher_code=excluded.teacher_code,teacher_name=excluded.teacher_name;
 RETURN uid::text;
END $$;
REVOKE ALL ON FUNCTION public.v4_admin_link_teacher(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v4_admin_link_teacher(text,text,text) TO authenticated;

-- Synchronize class permissions from published timetable, with explicit verified identities.
-- Manually-granted access is preserved and never automatically revoked.
CREATE TABLE IF NOT EXISTS public.v4_tkb_auto_grants(
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 school_year text NOT NULL,class_code text NOT NULL,
 role text NOT NULL CHECK(role IN ('gvbm','gvcn')),
 version_id text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,school_year,class_code,role)
);
ALTER TABLE public.v4_tkb_auto_grants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS v4_tkb_grants_admin_read ON public.v4_tkb_auto_grants;
CREATE POLICY v4_tkb_grants_admin_read ON public.v4_tkb_auto_grants FOR SELECT TO authenticated USING(public.v4_admin());
REVOKE ALL ON public.v4_tkb_auto_grants FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.v4_tkb_auto_grants TO authenticated;

-- This function deliberately uses exact teacher_code for GVBM and exact FULL teacher_name for GVCN.
-- Ambiguous or unbound teacher names are reported and never guessed.
CREATE OR REPLACE FUNCTION public.v4_sync_published_tkb()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v record; r record; identity_count integer; teacher_uid uuid;
        desired jsonb:='[]'::jsonb; current_pair jsonb;
        oldpair record; inserted_rows integer; added integer:=0; removed integer:=0;
        unresolved jsonb:='[]'::jsonb;
BEGIN
 IF NOT public.v4_admin() THEN RAISE EXCEPTION 'Chỉ quản trị được đồng bộ PCCM'; END IF;
 SELECT id,school_year,version_name INTO v FROM public.tkb_versions
 WHERE status='published' AND is_active=true ORDER BY published_at DESC LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'Chưa có TKB đã công bố'; END IF;
 -- Never revoke permissions if the published version lacks a complete PCCM/GVCN sheet.
 IF NOT EXISTS(SELECT 1 FROM public.tkb_assignments a WHERE a.version_id=v.id) THEN
  RETURN jsonb_build_object('applied',false,'version',v.version_name,'added',0,'removed',0,
   'reason','Phiên bản TKB chưa có dữ liệu PCCM/GVCN','unresolved','[]'::jsonb);
 END IF;
 IF EXISTS(
  SELECT 1 FROM (SELECT DISTINCT class_code FROM public.tkb_entries WHERE version_id=v.id) x
  WHERE nullif(btrim(x.class_code),'') IS NOT NULL AND NOT EXISTS(
   SELECT 1 FROM public.tkb_assignments a WHERE a.version_id=v.id
    AND btrim(a.homeroom_class)=btrim(x.class_code)
  )
 ) THEN
  RETURN jsonb_build_object('applied',false,'version',v.version_name,'added',0,'removed',0,
   'reason','Chưa có GVCN trong PCCM cho đủ các lớp','unresolved','[]'::jsonb);
 END IF;
 -- Teacher subject assignments keyed to verified TKB teacher_code.
 FOR r IN SELECT DISTINCT e.teacher_code,e.class_code FROM public.tkb_entries e
          WHERE e.version_id=v.id AND e.class_code IS NOT NULL AND nullif(btrim(e.teacher_code),'') IS NOT NULL LOOP
  SELECT count(*),min(t.user_id::text)::uuid INTO identity_count,teacher_uid
  FROM public.v4_teachers t WHERE t.teacher_code=r.teacher_code;
  IF identity_count=1 AND nullif(btrim(r.teacher_code),'') IS NOT NULL THEN
   desired=desired||jsonb_build_array(jsonb_build_object('uid',teacher_uid,'year',v.school_year,'cls',r.class_code,'role','gvbm'));
  ELSE
   unresolved=unresolved||jsonb_build_array(jsonb_build_object('type','gvbm','code',r.teacher_code,'class',r.class_code));
  END IF;
 END LOOP;
 -- Homeroom owner keyed to exact full name in authoritative TKB assignment sheet.
 FOR r IN SELECT DISTINCT a.homeroom_class,a.teacher_name FROM public.tkb_assignments a
   WHERE a.version_id=v.id AND nullif(btrim(a.homeroom_class),'') IS NOT NULL LOOP
  SELECT count(*),min(t.user_id::text)::uuid INTO identity_count,teacher_uid
   FROM public.v4_teachers t WHERE lower(regexp_replace(btrim(t.teacher_name),'\s+',' ','g'))=
    lower(regexp_replace(btrim(r.teacher_name),'\s+',' ','g'));
  IF identity_count=1 THEN
   desired=desired||jsonb_build_array(jsonb_build_object('uid',teacher_uid,'year',v.school_year,'cls',r.homeroom_class,'role','gvcn'));
  ELSE
   unresolved=unresolved||jsonb_build_array(jsonb_build_object('type','gvcn','teacher',r.teacher_name,'class',r.homeroom_class));
  END IF;
 END LOOP;
 -- Conflict safety: abort rather than changing GVCN when two assignments claim one class.
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(desired) AS a(value)
    WHERE a.value->>'role'='gvcn' GROUP BY a.value->>'year',a.value->>'cls' HAVING count(DISTINCT a.value->>'uid')>1)
 THEN RAISE EXCEPTION 'PCCM chứa nhiều GVCN cho một lớp; cần kiểm tra Excel'; END IF;
 -- Also abort before revoking the previous GVCN when a new GVCN cannot be verified.
 IF jsonb_array_length(unresolved)>0 THEN
  RETURN jsonb_build_object('applied',false,'version',v.version_name,'added',0,'removed',0,'unresolved',unresolved,'reason','Có giáo viên/PCCM chưa được liên kết tài khoản');
 END IF;
 -- Do not silently ignore a conflicting manually assigned GVCN.
 IF EXISTS(
  SELECT 1 FROM jsonb_array_elements(desired) AS x(value)
  JOIN public.v4_class_access ca ON ca.school_year=x.value->>'year'
    AND ca.class_code=x.value->>'cls' AND ca.role='gvcn'
    AND ca.user_id::text<>x.value->>'uid'
  LEFT JOIN public.v4_tkb_auto_grants aut ON aut.user_id=ca.user_id
   AND aut.school_year=ca.school_year AND aut.class_code=ca.class_code AND aut.role=ca.role
  WHERE x.value->>'role'='gvcn' AND aut.user_id IS NULL
 ) THEN
  RETURN jsonb_build_object('applied',false,'version',v.version_name,'added',0,'removed',0,
   'unresolved',unresolved,'reason','GVCN được cấp thủ công đang khác PCCM; quản trị phải đối chiếu');
 END IF;
 -- Sync only rows this process owns. Preserve all manual grants.
 FOR oldpair IN SELECT * FROM public.v4_tkb_auto_grants WHERE school_year=v.school_year LOOP
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(desired) AS x(value)
     WHERE x.value->>'uid'=oldpair.user_id::text AND x.value->>'year'=oldpair.school_year
       AND x.value->>'cls'=oldpair.class_code AND x.value->>'role'=oldpair.role) THEN
   DELETE FROM public.v4_class_access WHERE user_id=oldpair.user_id AND school_year=oldpair.school_year
    AND class_code=oldpair.class_code AND role=oldpair.role;
   DELETE FROM public.v4_tkb_auto_grants WHERE user_id=oldpair.user_id AND school_year=oldpair.school_year
    AND class_code=oldpair.class_code AND role=oldpair.role;
   IF oldpair.role='gvcn' THEN
    UPDATE public.v4_layouts SET is_confirmed=false,updated_at=now()
     WHERE school_year=oldpair.school_year AND class_code=oldpair.class_code;
   END IF;
   removed=removed+1;
  END IF;
 END LOOP;
 FOR current_pair IN SELECT DISTINCT value FROM jsonb_array_elements(desired) LOOP
  INSERT INTO public.v4_class_access(user_id,school_year,class_code,role)
   VALUES((current_pair->>'uid')::uuid,current_pair->>'year',current_pair->>'cls',current_pair->>'role')
   ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS inserted_rows=ROW_COUNT;
  IF inserted_rows>0 THEN
   added=added+1;
   IF current_pair->>'role'='gvcn' THEN
    UPDATE public.v4_layouts SET is_confirmed=false,updated_at=now()
     WHERE school_year=current_pair->>'year' AND class_code=current_pair->>'cls';
   END IF;
   INSERT INTO public.v4_tkb_auto_grants(user_id,school_year,class_code,role,version_id)
    VALUES((current_pair->>'uid')::uuid,current_pair->>'year',current_pair->>'cls',current_pair->>'role',v.id::text)
    ON CONFLICT(user_id,school_year,class_code,role) DO UPDATE SET version_id=excluded.version_id;
  ELSE
   UPDATE public.v4_tkb_auto_grants SET version_id=v.id::text
    WHERE user_id=(current_pair->>'uid')::uuid AND school_year=current_pair->>'year'
     AND class_code=current_pair->>'cls' AND role=current_pair->>'role';
  END IF;
 END LOOP;
 RETURN jsonb_build_object('applied',true,'version',v.version_name,'added',added,'removed',removed,'unresolved',unresolved);
END $$;
REVOKE ALL ON FUNCTION public.v4_sync_published_tkb() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v4_sync_published_tkb() TO authenticated;
COMMIT;
