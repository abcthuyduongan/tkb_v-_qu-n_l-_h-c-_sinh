-- After 01 + 03. Flexible groups approved 23/10/2026. No changes to tkb_*.
BEGIN;
CREATE OR REPLACE FUNCTION public.v4_valid_desks(j jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE v text;
BEGIN
 IF j IS NULL OR jsonb_typeof(j)<>'array' THEN RETURN false; END IF;
 IF jsonb_array_length(j) NOT BETWEEN 1 AND 12 THEN RETURN false; END IF;
 FOR v IN SELECT jsonb_array_elements_text(j) LOOP
  IF v IS NULL OR v !~ '^[0-9]{1,2}$' OR v::int NOT BETWEEN 1 AND 20 THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
END $$;
ALTER TABLE public.v4_layouts DROP CONSTRAINT IF EXISTS valid_desk_counts;
ALTER TABLE public.v4_seats DROP CONSTRAINT IF EXISTS v4_seats_group_no_check;
ALTER TABLE public.v4_seats ADD CONSTRAINT v4_seats_group_no_check CHECK(group_no BETWEEN 1 AND 12);

CREATE OR REPLACE FUNCTION public.v4_validate_seat_position() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer;
BEGIN
 SELECT (desk_counts->>(NEW.group_no-1))::integer INTO n FROM public.v4_layouts
 WHERE school_year=NEW.school_year AND class_code=NEW.class_code FOR UPDATE;
 IF n IS NULL OR NEW.desk_no>n OR NOT public.v4_student_class(NEW.student_id,NEW.school_year,NEW.class_code) THEN
  RAISE EXCEPTION 'Học sinh hoặc vị trí không thuộc sơ đồ lớp';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS v4_check_seat_position ON public.v4_seats;
CREATE TRIGGER v4_check_seat_position BEFORE INSERT OR UPDATE ON public.v4_seats
 FOR EACH ROW EXECUTE FUNCTION public.v4_validate_seat_position();

CREATE OR REPLACE FUNCTION public.v4_set_group_count(y text,c text,n integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE counts jsonb; i integer;
BEGIN
 IF NOT public.v4_actual_homeroom(y,c) THEN RAISE EXCEPTION 'Chỉ GVCN được thay đổi số tổ'; END IF;
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
REVOKE ALL ON FUNCTION public.v4_set_group_count(text,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v4_set_group_count(text,text,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.v4_assign_seat(y text,c text,g integer,d integer,s integer,st uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer;
BEGIN
 IF NOT public.v4_actual_homeroom(y,c) THEN RAISE EXCEPTION 'Chỉ GVCN được xếp chỗ'; END IF;
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
 IF NOT public.v4_actual_homeroom(y,c) THEN RAISE EXCEPTION 'Chỉ GVCN được thêm/bớt bàn'; END IF;
 INSERT INTO public.v4_layouts(school_year,class_code,updated_by) VALUES(y,c,auth.uid()) ON CONFLICT DO NOTHING;
 SELECT desk_counts INTO counts FROM public.v4_layouts WHERE school_year=y AND class_code=c FOR UPDATE;
 IF g IS NULL OR g NOT BETWEEN 1 AND jsonb_array_length(counts) OR n IS NULL OR n NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'Tổ hoặc số bàn không hợp lệ'; END IF;
 DELETE FROM public.v4_seats WHERE school_year=y AND class_code=c AND group_no=g AND desk_no>n;
 UPDATE public.v4_layouts SET desk_counts=jsonb_set(counts,ARRAY[(g-1)::text],to_jsonb(n)),is_confirmed=false,updated_at=now(),updated_by=auth.uid()
 WHERE school_year=y AND class_code=c;
END $$;
COMMIT;
