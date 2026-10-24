-- Optional repair for one active legacy timetable's year metadata.
-- Backup first. No pupil/history identifiers are rewritten or merged.
BEGIN;
DO $repair$
DECLARE v public.tkb_versions%rowtype; canonical text; item record; conflicts bigint;
BEGIN
 IF to_regprocedure('public.v4_school_year_valid(text)') IS NULL THEN RAISE EXCEPTION 'Can hoan tat module den buoc16 truoc khi sua metadata nam hoc.'; END IF;
 SELECT count(*) INTO conflicts FROM public.tkb_versions WHERE status='published' AND is_active;
 IF conflicts<>1 THEN RAISE EXCEPTION 'Can dung1 TKB dang cong bo, hien co %. Dung lai de doi chieu.',conflicts; END IF;
 SELECT * INTO v FROM public.tkb_versions WHERE status='published' AND is_active FOR UPDATE;
 canonical=regexp_replace(btrim(coalesce(v.school_year,'')),'[[:space:]]*[-–—][[:space:]]*','-','g');
 IF NOT public.v4_school_year_valid(canonical) THEN RAISE EXCEPTION 'Khong the xac dinh nam hoc tu %. Khong tu suy doan.',v.school_year; END IF;
 IF v.school_year=canonical THEN RAISE NOTICE 'Nam hoc da dung %, khong thay doi.',canonical;RETURN; END IF;
 IF EXISTS(SELECT 1 FROM public.tkb_versions t WHERE t.id<>v.id AND t.school_year=canonical AND t.version_no=v.version_no AND coalesce(t.semester,'')=coalesce(v.semester,'')) THEN RAISE EXCEPTION 'Co TKB khac cung nam/hoc ky/so phien ban. Khong tu gop; can doi chieu.'; END IF;
 FOR item IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid WHERE n.nspname='public' AND c.relkind='r' AND a.attname='school_year' AND NOT a.attisdropped AND c.relname<>'tkb_versions'
 LOOP
  EXECUTE format($query$SELECT count(*) FROM public.%I WHERE school_year IS DISTINCT FROM $1 AND regexp_replace(btrim(coalesce(school_year,'')),'[[:space:]]*[-–—][[:space:]]*','-','g')=$1$query$,item.relname) INTO conflicts USING canonical;
  IF conflicts>0 THEN RAISE EXCEPTION 'Bang % con % dong dung bien the nam hoc cu. Khong sua/gop lich su; can doi chieu truoc.',item.relname,conflicts; END IF;
 END LOOP;
 UPDATE public.tkb_versions SET school_year=canonical WHERE id=v.id AND school_year IS NOT DISTINCT FROM v.school_year;
END $repair$;
NOTIFY pgrst, 'reload schema';
COMMIT;
SELECT id,version_name,school_year,status,is_active FROM public.tkb_versions WHERE status='published' AND is_active;
