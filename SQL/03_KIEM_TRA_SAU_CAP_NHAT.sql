-- Chi doc. Can2 ham, security_definer=false, anon_execute=false, authenticated_execute=true.
SELECT p.proname,pg_get_function_identity_arguments(p.oid) AS parameters,
 p.prosecdef AS security_definer,has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN('v4_daily_learning','v4_lesson_handoffs') ORDER BY p.proname;
SELECT c.relname AS table_name,c.relrowsecurity AS rls_enabled FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND starts_with(c.relname,'v4_') ORDER BY c.relname;
SELECT public.v4_school_today() AS school_today,statement_timestamp() AS server_now;
SELECT category,behavior_code,active FROM public.v4_behaviors WHERE lower(btrim(behavior_code))='xuất sắc';
-- SQL Editor khong dai dien JWT giao vien. Sau day van can test dang nhap/phan quyen that.
