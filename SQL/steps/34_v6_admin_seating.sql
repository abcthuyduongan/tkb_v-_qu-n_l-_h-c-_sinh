-- Explicit request27/10: administrators may arrange seats, without teaching rights.
BEGIN;
DO $$ BEGIN IF to_regprocedure('public.v4_overview(text,date,date,text)') IS NULL THEN RAISE EXCEPTION 'Cần cập nhật33 trước34'; END IF; END $$;
CREATE OR REPLACE FUNCTION public.v4_can_arrange_seats(y text,c text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT public.v4_credentials_ready() AND (public.v4_admin() OR public.v4_actual_homeroom(y,c))
$$;
REVOKE ALL ON FUNCTION public.v4_can_arrange_seats(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.v4_can_arrange_seats(text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.v4_set_group_count(y text,c text,n integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE counts jsonb; i integer;
BEGIN
 IF NOT public.v4_can_arrange_seats(y,c) THEN RAISE EXCEPTION 'Chỉ GVCN hoặc quản trị được thay đổi số tổ'; END IF;
 IF n IS NULL OR n NOT BETWEEN 1 AND 12 THEN RAISE EXCEPTION 'Số tổ phải từ 1 đến 12'; END IF;
 INSERT INTO public.v4_layouts(school_year,class_code,updated_by) VALUES(y,c,auth.uid()) ON CONFLICT DO NOTHING;
 SELECT desk_counts INTO counts FROM public.v4_layouts WHERE school_year=y AND class_code=c FOR UPDATE;
 IF n=jsonb_array_length(counts) THEN RETURN; END IF;
 IF n<jsonb_array_length(counts) THEN
  SELECT jsonb_agg(value ORDER BY ord) INTO counts FROM jsonb_array_elements(counts) WITH ORDINALITY t(value,ord) WHERE ord<=n;
 ELSE
  FOR i IN jsonb_array_length(counts)+1..n LOOP counts=counts||'[4]'::jsonb; END LOOP;
 END IF;
 DELETE FROM public.v4_seats WHERE school_year=y AND class_code=c AND group_no>n;
 UPDATE public.v4_layouts SET desk_counts=counts,is_confirmed=false,updated_at=now(),updated_by=auth.uid()
 WHERE school_year=y AND class_code=c;
END $$;

CREATE OR REPLACE FUNCTION public.v4_assign_seat(y text,c text,g integer,d integer,s integer,st uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer;
BEGIN
 IF NOT public.v4_can_arrange_seats(y,c) THEN RAISE EXCEPTION 'Chỉ GVCN hoặc quản trị được xếp chỗ'; END IF;
 IF g IS NULL OR g NOT BETWEEN 1 AND 12 OR d IS NULL OR d<1 OR s IS NULL OR s NOT IN (1,2) THEN RAISE EXCEPTION 'Vị trí không hợp lệ'; END IF;
 SELECT (desk_counts->>(g-1))::integer INTO n FROM public.v4_layouts WHERE school_year=y AND class_code=c FOR UPDATE;
 IF n IS NULL OR d>n THEN RAISE EXCEPTION 'Chưa thiết lập bàn hợp lệ'; END IF;
 IF st IS NOT NULL AND NOT public.v4_student_class(st,y,c) THEN RAISE EXCEPTION 'Học sinh không thuộc lớp'; END IF;
 IF st IS NOT NULL THEN DELETE FROM public.v4_seats WHERE school_year=y AND class_code=c AND student_id=st; END IF;
 DELETE FROM public.v4_seats WHERE school_year=y AND class_code=c AND group_no=g AND desk_no=d AND seat_no=s;
 IF st IS NOT NULL THEN INSERT INTO public.v4_seats(school_year,class_code,group_no,desk_no,seat_no,student_id) VALUES(y,c,g,d,s,st); END IF;
END $$;

CREATE OR REPLACE FUNCTION public.v4_set_desks(y text,c text,g integer,n integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE counts jsonb;
BEGIN
 IF NOT public.v4_can_arrange_seats(y,c) THEN RAISE EXCEPTION 'Chỉ GVCN hoặc quản trị được thêm/bớt bàn'; END IF;
 INSERT INTO public.v4_layouts(school_year,class_code,updated_by) VALUES(y,c,auth.uid()) ON CONFLICT DO NOTHING;
 SELECT desk_counts INTO counts FROM public.v4_layouts WHERE school_year=y AND class_code=c FOR UPDATE;
 IF g IS NULL OR g NOT BETWEEN 1 AND jsonb_array_length(counts) OR n IS NULL OR n NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'Tổ hoặc số bàn không hợp lệ'; END IF;
 DELETE FROM public.v4_seats WHERE school_year=y AND class_code=c AND group_no=g AND desk_no>n;
 UPDATE public.v4_layouts SET desk_counts=jsonb_set(counts,ARRAY[(g-1)::text],to_jsonb(n)),is_confirmed=false,updated_at=now(),updated_by=auth.uid()
 WHERE school_year=y AND class_code=c;
END $$;

CREATE OR REPLACE FUNCTION public.v4_confirm_layout(y text,c text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.v4_can_arrange_seats(y,c) THEN RAISE EXCEPTION 'Chỉ GVCN hoặc quản trị được chốt sơ đồ'; END IF;
 UPDATE public.v4_layouts SET is_confirmed=true,updated_at=now(),updated_by=auth.uid()
 WHERE school_year=y AND class_code=c;
 IF NOT FOUND THEN RAISE EXCEPTION 'Chưa có sơ đồ để chốt'; END IF;
END $$;

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
  IF NOT public.v4_can_arrange_seats(NEW.school_year,NEW.class_code) THEN
   RAISE EXCEPTION 'Chỉ GVCN hoặc quản trị được chốt sơ đồ';
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

DROP POLICY IF EXISTS v4_layout_manage ON public.v4_layouts;
DROP POLICY IF EXISTS v4_layout_edit ON public.v4_layouts;
DROP POLICY IF EXISTS v4_seat_add ON public.v4_seats;
DROP POLICY IF EXISTS v4_seat_edit ON public.v4_seats;
DROP POLICY IF EXISTS v4_seat_delete ON public.v4_seats;
CREATE POLICY v4_layout_manage ON public.v4_layouts FOR INSERT TO authenticated WITH CHECK(public.v4_can_arrange_seats(school_year,class_code));
CREATE POLICY v4_layout_edit ON public.v4_layouts FOR UPDATE TO authenticated USING(public.v4_can_arrange_seats(school_year,class_code)) WITH CHECK(public.v4_can_arrange_seats(school_year,class_code));
CREATE POLICY v4_seat_add ON public.v4_seats FOR INSERT TO authenticated WITH CHECK(public.v4_can_arrange_seats(school_year,class_code));
CREATE POLICY v4_seat_edit ON public.v4_seats FOR UPDATE TO authenticated USING(public.v4_can_arrange_seats(school_year,class_code)) WITH CHECK(public.v4_can_arrange_seats(school_year,class_code));
CREATE POLICY v4_seat_delete ON public.v4_seats FOR DELETE TO authenticated USING(public.v4_can_arrange_seats(school_year,class_code));
-- Record both the student placement and layout approval author.
CREATE OR REPLACE FUNCTION public.v4_audit_seat_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE before_row jsonb;after_row jsonb;identity_row jsonb;
BEGIN
 IF TG_OP<>'INSERT' THEN before_row:=to_jsonb(OLD); END IF;
 IF TG_OP<>'DELETE' THEN after_row:=to_jsonb(NEW); END IF;
 identity_row:=coalesce(after_row,before_row);
 INSERT INTO public.v4_audit(table_name,row_id,old_row,new_row,operation,changed_by)
 VALUES(TG_TABLE_NAME,identity_row->>'school_year'||'|'||(identity_row->>'class_code'),before_row,after_row,TG_OP,auth.uid());
 RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS v4_audit_seats ON public.v4_seats;
DROP TRIGGER IF EXISTS v4_audit_layouts ON public.v4_layouts;
CREATE TRIGGER v4_audit_seats AFTER INSERT OR UPDATE OR DELETE ON public.v4_seats FOR EACH ROW EXECUTE FUNCTION public.v4_audit_seat_change();
CREATE TRIGGER v4_audit_layouts AFTER INSERT OR UPDATE ON public.v4_layouts FOR EACH ROW EXECUTE FUNCTION public.v4_audit_seat_change();
REVOKE ALL ON FUNCTION public.v4_audit_seat_change(),public.v4_layout_approval_guard() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.v4_assign_seat(text,text,integer,integer,integer,uuid),public.v4_set_desks(text,text,integer,integer),public.v4_set_group_count(text,text,integer),public.v4_confirm_layout(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.v4_assign_seat(text,text,integer,integer,integer,uuid),public.v4_set_desks(text,text,integer,integer),public.v4_set_group_count(text,text,integer),public.v4_confirm_layout(text,text) TO authenticated;
CREATE INDEX IF NOT EXISTS v4_observations_session_idx ON public.v4_observations(session_id);
CREATE INDEX IF NOT EXISTS v4_students_year_class_active_idx ON public.v4_students(school_year,class_code,active);
CREATE INDEX IF NOT EXISTS v4_lesson_reviews_year_class_date_idx ON public.v4_lesson_reviews(school_year,class_code,lesson_date);
ALTER FUNCTION public.v4_admin() STABLE;
ALTER FUNCTION public.v4_has_class(text,text) STABLE;
ALTER FUNCTION public.v4_health_access(text,text) STABLE;
ALTER FUNCTION public.v4_shared_teacher(uuid) STABLE;
ALTER FUNCTION public.v4_actual_class_access(text,text) STABLE;
ALTER FUNCTION public.v4_actual_homeroom(text,text) STABLE;
ALTER FUNCTION public.v4_student_class(uuid,text,text) STABLE;
ALTER FUNCTION public.v4_credentials_ready() STABLE;
ALTER FUNCTION public.v4_school_today() STABLE;
ALTER FUNCTION public.v4_check_lesson_writable(uuid) STABLE;
ALTER FUNCTION public.v4_school_year_valid(text) IMMUTABLE;
NOTIFY pgrst,'reload schema';
COMMIT;
