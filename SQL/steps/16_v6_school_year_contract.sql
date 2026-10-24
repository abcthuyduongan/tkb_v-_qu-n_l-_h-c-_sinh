-- Canonical school-year identity. Historical rows are audited, never rewritten.
-- Run after migration 15. The guards apply to new rows / changed identities only.
BEGIN;

CREATE OR REPLACE FUNCTION public.v4_school_year_valid(value text) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 SELECT CASE WHEN value ~ '^[0-9]{4}-[0-9]{4}$'
  THEN substring(value,6,4)::integer = substring(value,1,4)::integer + 1
  ELSE false END
$$;

CREATE OR REPLACE FUNCTION public.v4_school_year_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.school_year IS NOT DISTINCT FROM OLD.school_year THEN RETURN NEW; END IF;
 END IF;
 IF NOT public.v4_school_year_valid(NEW.school_year) THEN
  RAISE EXCEPTION 'Năm học không hợp lệ: dùng YYYY-YYYY với hai năm liên tiếp (ví dụ 2026-2027). Bảng: %',TG_TABLE_NAME
   USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;

-- Apply to both legacy timetable/PPCT and student-management tables present now.
DO $$ DECLARE item record;
BEGIN
 FOR item IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  JOIN pg_attribute a ON a.attrelid=c.oid
  WHERE n.nspname='public' AND c.relkind='r' AND a.attname='school_year' AND NOT a.attisdropped
 LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS v4_school_year_identity ON public.%I',item.relname);
  EXECUTE format('CREATE TRIGGER v4_school_year_identity BEFORE INSERT OR UPDATE OF school_year ON public.%I FOR EACH ROW EXECUTE FUNCTION public.v4_school_year_guard()',item.relname);
 END LOOP;
END $$;

-- Existing malformed drafts must not become active, even when school_year is unchanged.
CREATE OR REPLACE FUNCTION public.v4_published_year_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF public.v4_school_year_valid(NEW.school_year) THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' THEN
  -- Deactivating a malformed historical publication must remain possible.
  IF NOT NEW.is_active AND (NEW.status<>'published' OR
    (OLD.status='published' AND NEW.school_year IS NOT DISTINCT FROM OLD.school_year)) THEN RETURN NEW; END IF;
 END IF;
 IF NEW.is_active OR NEW.status='published' THEN
  RAISE EXCEPTION 'Chưa thể công bố: năm học không đúng YYYY-YYYY liên tiếp. Chạy kiểm kê năm học và đối chiếu dữ liệu trước khi sửa bản cũ.'
   USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS v4_published_year ON public.tkb_versions;
CREATE TRIGGER v4_published_year BEFORE INSERT OR UPDATE OF status,is_active,school_year ON public.tkb_versions
 FOR EACH ROW EXECUTE FUNCTION public.v4_published_year_guard();

-- Admin-only read-only inventory: counts and year keys, never student details.
-- canonical_candidate is a suggestion, not a migration or a merge decision.
CREATE OR REPLACE FUNCTION public.v4_school_year_preflight() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE item record; group_row record; inventory jsonb:='[]'; candidate text;
 invalid_rows bigint:=0; invalid_groups integer:=0; variants jsonb;
BEGIN
 IF NOT public.v4_admin() THEN RAISE EXCEPTION 'Chỉ quản trị được kiểm kê năm học'; END IF;
 FOR item IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  JOIN pg_attribute a ON a.attrelid=c.oid
  WHERE n.nspname='public' AND c.relkind='r' AND a.attname='school_year' AND NOT a.attisdropped
  ORDER BY c.relname
 LOOP
  FOR group_row IN EXECUTE format('SELECT school_year,count(*) AS row_count FROM public.%I GROUP BY school_year ORDER BY school_year',item.relname)
  LOOP
   candidate=regexp_replace(btrim(coalesce(group_row.school_year,'')),'[[:space:]]*[–—-][[:space:]]*','-','g');
   IF NOT public.v4_school_year_valid(candidate) THEN candidate=NULL; END IF;
   inventory=inventory||jsonb_build_array(jsonb_build_object('table',item.relname,'school_year',group_row.school_year,
    'row_count',group_row.row_count,'canonical',public.v4_school_year_valid(group_row.school_year),'canonical_candidate',candidate));
   IF NOT public.v4_school_year_valid(group_row.school_year) THEN
    invalid_rows=invalid_rows+group_row.row_count; invalid_groups=invalid_groups+1;
   END IF;
  END LOOP;
 END LOOP;
 SELECT coalesce(jsonb_agg(to_jsonb(v)),'[]') INTO variants FROM (
  SELECT e->>'canonical_candidate' AS canonical_candidate,jsonb_agg(DISTINCT e->'school_year') AS raw_values
  FROM jsonb_array_elements(inventory) e WHERE e->>'canonical_candidate' IS NOT NULL
  GROUP BY e->>'canonical_candidate' HAVING count(DISTINCT e->>'school_year')>1
 ) v;
 RETURN jsonb_build_object('invalid_rows',invalid_rows,'invalid_groups',invalid_groups,
  'inventory',inventory,'variants',variants,'read_only',true);
END $$;
REVOKE ALL ON FUNCTION public.v4_school_year_preflight() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.v4_school_year_preflight() TO authenticated;
COMMIT;
