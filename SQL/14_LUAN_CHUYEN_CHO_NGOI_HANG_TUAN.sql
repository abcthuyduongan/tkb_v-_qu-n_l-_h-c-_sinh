-- Sau SQL12/module34 va SQL13/module35. Khong doi vi tri goc; them quy luat tuan.
-- Weekly seating rules are a projection of the approved reference plan.
-- No scheduled writes, student moves, attendance changes or new teaching rights.
BEGIN;
DO $$ BEGIN
 IF to_regprocedure('public.v4_can_arrange_seats(text,text)') IS NULL THEN
  RAISE EXCEPTION 'Cần cài module34 trước module36 luân chuyển chỗ ngồi';
 END IF;
END $$;

ALTER TABLE public.v4_layouts ADD COLUMN IF NOT EXISTS rotation_config jsonb NOT NULL
 DEFAULT '{"enabled":false,"start_date":null,"horizontal":"none","horizontal_groups":[],"vertical":{}}'::jsonb;
ALTER TABLE public.v4_layouts ADD COLUMN IF NOT EXISTS rotation_revision integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.v4_validate_seating_rotation(p jsonb,counts jsonb,confirmed boolean)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path=public,pg_temp AS $$
DECLARE n integer:=jsonb_array_length(counts); item jsonb; k text; v jsonb; start_day date; ids integer[]:='{}'; has_vertical boolean:=false;
BEGIN
 IF p IS NULL OR jsonb_typeof(p)<>'object' OR
    (SELECT count(*) FROM jsonb_object_keys(p))<>5 OR
    NOT p ?& ARRAY['enabled','start_date','horizontal','horizontal_groups','vertical'] OR
    jsonb_typeof(p->'enabled')<>'boolean' OR
    jsonb_typeof(p->'horizontal')<>'string' OR p->>'horizontal' NOT IN('none','left','right') OR
    jsonb_typeof(p->'horizontal_groups')<>'array' OR jsonb_array_length(p->'horizontal_groups')>12 OR
    jsonb_typeof(p->'vertical')<>'object' THEN
  RAISE EXCEPTION 'Cấu hình luân chuyển không hợp lệ';
 END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p->'horizontal_groups') LOOP
  IF jsonb_typeof(item)<>'number' OR item::text !~ '^[1-9][0-9]?$' OR (item::text)::integer>n THEN
   RAISE EXCEPTION 'Tổ luân chuyển không thuộc sơ đồ hiện tại';
  END IF;
  IF (item::text)::integer=ANY(ids) THEN RAISE EXCEPTION 'Tổ luân chuyển bị lặp'; END IF;
  ids:=array_append(ids,(item::text)::integer);
 END LOOP;
 FOR k,v IN SELECT key,value FROM jsonb_each(p->'vertical') LOOP
  IF k !~ '^[1-9][0-9]?$' OR k::integer>n OR jsonb_typeof(v)<>'string' OR v#>>'{}' NOT IN('none','up','down') THEN
   RAISE EXCEPTION 'Hướng chuyển hàng bàn không hợp lệ';
  END IF;
  has_vertical:=has_vertical OR v#>>'{}' IN('up','down');
 END LOOP;
 IF p->'start_date'<>'null'::jsonb THEN
  IF jsonb_typeof(p->'start_date')<>'string' OR p->>'start_date' !~ '^\d{4}-\d{2}-\d{2}$' THEN
   RAISE EXCEPTION 'Chọn ngày thứ Hai để bắt đầu luân chuyển';
  END IF;
  BEGIN start_day:=(p->>'start_date')::date;
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Ngày bắt đầu không hợp lệ'; END;
  IF extract(isodow FROM start_day)<>1 THEN RAISE EXCEPTION 'Ngày bắt đầu phải là thứ Hai'; END IF;
 END IF;
 IF (p->>'enabled')::boolean THEN
  IF NOT confirmed THEN RAISE EXCEPTION 'Cần chốt đủ sơ đồ gốc trước khi bật luân chuyển'; END IF;
  IF start_day IS NULL THEN RAISE EXCEPTION 'Chọn thứ Hai bắt đầu chuyển'; END IF;
  IF p->>'horizontal'<>'none' AND cardinality(ids)<2 THEN RAISE EXCEPTION 'Chọn ít nhất hai tổ để đổi dãy'; END IF;
  IF p->>'horizontal'='none' AND NOT has_vertical THEN RAISE EXCEPTION 'Chọn ít nhất một hướng luân chuyển'; END IF;
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.v4_guard_seating_rotation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE changed boolean;
BEGIN
 IF TG_OP='INSERT' THEN
  NEW.rotation_revision:=0;
 ELSE
  -- Changing the reference geometry resets the rule. Editing a pupil pauses it.
  IF NEW.desk_counts IS DISTINCT FROM OLD.desk_counts THEN
   NEW.rotation_config:='{"enabled":false,"start_date":null,"horizontal":"none","horizontal_groups":[],"vertical":{}}'::jsonb;
  ELSIF NOT NEW.is_confirmed AND OLD.is_confirmed THEN
   NEW.rotation_config:=jsonb_set(NEW.rotation_config,'{enabled}','false'::jsonb);
  END IF;
  changed:=NEW.rotation_config IS DISTINCT FROM OLD.rotation_config OR NEW.desk_counts IS DISTINCT FROM OLD.desk_counts;
  IF changed THEN
   IF auth.uid() IS NOT NULL AND NOT public.v4_can_arrange_seats(NEW.school_year,NEW.class_code)
      AND NEW.rotation_config IS DISTINCT FROM jsonb_set(OLD.rotation_config,'{enabled}','false'::jsonb) THEN
    RAISE EXCEPTION 'Chỉ GVCN hoặc quản trị được cấu hình luân chuyển';
   END IF;
   NEW.rotation_revision:=OLD.rotation_revision+1;
   NEW.updated_at:=now();NEW.updated_by:=auth.uid();
  ELSE NEW.rotation_revision:=OLD.rotation_revision;
  END IF;
 END IF;
 PERFORM public.v4_validate_seating_rotation(NEW.rotation_config,NEW.desk_counts,NEW.is_confirmed);
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS v4_rotation_guard ON public.v4_layouts;
CREATE TRIGGER v4_rotation_guard BEFORE INSERT OR UPDATE ON public.v4_layouts
 FOR EACH ROW EXECUTE FUNCTION public.v4_guard_seating_rotation();

CREATE OR REPLACE FUNCTION public.v4_get_seating_rotation(y text,c text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE r public.v4_layouts%ROWTYPE;
BEGIN
 IF NOT public.v4_credentials_ready() OR NOT public.v4_has_class(y,c) THEN RAISE EXCEPTION 'Không có quyền xem sơ đồ lớp'; END IF;
 SELECT * INTO r FROM public.v4_layouts WHERE school_year=y AND class_code=c;
 RETURN jsonb_build_object('config',coalesce(r.rotation_config,'{"enabled":false,"start_date":null,"horizontal":"none","horizontal_groups":[],"vertical":{}}'::jsonb),
  'revision',coalesce(r.rotation_revision,0),'layout_updated_at',r.updated_at,'desk_counts',r.desk_counts,
  'is_confirmed',coalesce(r.is_confirmed,false),'server_today',public.v4_school_today());
END $$;

CREATE OR REPLACE FUNCTION public.v4_save_seating_rotation(y text,c text,p_config jsonb,p_expected_revision integer,p_expected_layout_updated_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.v4_layouts%ROWTYPE;
BEGIN
 IF NOT public.v4_can_arrange_seats(y,c) THEN RAISE EXCEPTION 'Chỉ GVCN hoặc quản trị được cấu hình luân chuyển'; END IF;
 SELECT * INTO r FROM public.v4_layouts WHERE school_year=y AND class_code=c FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Cần tạo và chốt sơ đồ gốc trước'; END IF;
 IF p_expected_revision IS NULL OR p_expected_layout_updated_at IS NULL OR
    r.rotation_revision<>p_expected_revision OR r.updated_at<>p_expected_layout_updated_at THEN
  RAISE EXCEPTION 'Sơ đồ hoặc quy luật đã thay đổi ở nơi khác. Làm mới rồi xem lại trước khi lưu';
 END IF;
 PERFORM public.v4_validate_seating_rotation(p_config,r.desk_counts,r.is_confirmed);
 UPDATE public.v4_layouts SET rotation_config=p_config WHERE school_year=y AND class_code=c;
 RETURN public.v4_get_seating_rotation(y,c);
END $$;

REVOKE ALL ON FUNCTION public.v4_validate_seating_rotation(jsonb,jsonb,boolean),public.v4_guard_seating_rotation() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.v4_get_seating_rotation(text,text),public.v4_save_seating_rotation(text,text,jsonb,integer,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.v4_get_seating_rotation(text,text),public.v4_save_seating_rotation(text,text,jsonb,integer,timestamptz) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
