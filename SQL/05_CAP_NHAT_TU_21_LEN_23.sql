-- Administrator and teaching accounts are separate, including legacy dual grants.
-- Apply after21. Optional metadata repair22 is independent. Keeps all history/grants.
BEGIN;
DO $guard$
BEGIN
 IF to_regprocedure('public.v4_credentials_ready()') IS NULL
 OR to_regprocedure('public.v4_lesson_handoffs(text,text,date,date,text)') IS NULL THEN
  RAISE EXCEPTION 'Can hoan tat module den21 truoc khi tach quyen quan tri/giao vien.';
 END IF;
END $guard$;
CREATE OR REPLACE FUNCTION public.v4_actual_class_access(y text,c text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.v4_credentials_ready() AND NOT public.v4_admin() AND EXISTS(
  SELECT 1 FROM public.v4_class_access WHERE user_id=auth.uid() AND school_year=y AND class_code=c
 )
$$;
CREATE OR REPLACE FUNCTION public.v4_actual_homeroom(y text,c text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.v4_credentials_ready() AND NOT public.v4_admin() AND EXISTS(
  SELECT 1 FROM public.v4_class_access WHERE user_id=auth.uid() AND school_year=y AND class_code=c AND role='gvcn'
 )
$$;
REVOKE ALL ON FUNCTION public.v4_actual_class_access(text,text),public.v4_actual_homeroom(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.v4_actual_class_access(text,text),public.v4_actual_homeroom(text,text) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
