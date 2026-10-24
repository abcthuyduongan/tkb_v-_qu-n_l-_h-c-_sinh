-- Chạy trên STAGING SAU file 01. Chỉ đọc, không sửa dữ liệu.
select current_database() as database_name, current_user as user_name;
select to_regclass('public.tkb_versions') is not null as tkb_versions_exists,
       to_regclass('public.tkb_entries') is not null as tkb_entries_exists,
       to_regclass('public.v4_students') is not null as students_exists,
       to_regclass('public.v4_observations') is not null as observations_exists,
       to_regclass('public.v4_support_logs') is not null as support_logs_exists;
select tablename, rowsecurity from pg_tables
where schemaname='public' and tablename like 'v4_%'
order by tablename;
select has_table_privilege('anon','public.v4_students','SELECT') as anon_student_select,
       has_table_privilege('anon','public.v4_observations','SELECT') as anon_observation_select,
       has_function_privilege('anon','public.v4_import_students(jsonb)','EXECUTE') as anon_import,
       has_function_privilege('authenticated','public.v4_import_students(jsonb)','EXECUTE') as auth_import;
select proname,prosecdef from pg_proc join pg_namespace n on n.oid=pg_proc.pronamespace
where n.nspname='public' and proname like 'v4_%' order by proname;
