-- Read-only checks after migrations 15/16/17/19/20. No tokens, pupil names or content.
-- This is a preflight, not an eighteenth migration. Execute with deployment admin.
SELECT proname,prosecdef AS security_definer FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND proname IN('v4_class_report','v4_school_year_preflight','v4_verify_session','v4_session_status','v4_credentials_ready','v4_teacher_directory','v4_save_lesson_review') ORDER BY proname;
SELECT c.relname AS table_name,c.relrowsecurity AS rls_enabled FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind='r' AND c.relname LIKE 'v4_%' ORDER BY c.relname;
SELECT version_id,status,reason,updated_at FROM public.v4_tkb_sync_state ORDER BY updated_at DESC;
SELECT school_year,count(*) AS versions FROM public.tkb_versions GROUP BY school_year ORDER BY school_year;
SELECT public.v4_school_today() AS school_today,statement_timestamp() AS server_now;
-- v4_school_year_preflight() requires a verified logged-in admin, even in SQL editor.
-- Test its API response with that account. It must reject teachers and anonymous users.
