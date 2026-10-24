-- CHAY TRUOC TIEN trong Supabase SQL Editor. Chi doc schema, khong sua du lieu.
SELECT current_database() AS database_name,current_user AS operator,statement_timestamp() AS checked_at;
SELECT item.name,to_regclass('public.'||item.name) IS NOT NULL AS exists_in_database
FROM (VALUES('tkb_versions'),('tkb_entries'),('tkb_assignments'),('v4_students'),('v4_observations'),('v4_teacher_private_contacts'),('v4_lesson_reviews')) AS item(name);
SELECT item.signature,to_regprocedure(item.signature) IS NOT NULL AS exists_in_database
FROM (VALUES('public.is_tkb_admin()'),('public.v4_credentials_ready()'),('public.v4_save_lesson_review(uuid,text)'),('public.v4_daily_learning(text,text)'),('public.v4_lesson_handoffs(text,text,date,date,text)')) AS item(signature);
SELECT n.nspname AS schema_name,c.relname AS table_name,c.relrowsecurity AS rls_enabled
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r' AND starts_with(c.relname,'v4_') ORDER BY c.relname;
SELECT CASE
 WHEN to_regclass('public.tkb_versions') IS NULL OR to_regclass('public.tkb_entries') IS NULL OR to_regclass('public.tkb_assignments') IS NULL OR to_regprocedure('public.is_tkb_admin()') IS NULL THEN 'STOP: thieu CSDL TKB goc; khong chay bo cai module.'
 WHEN NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND starts_with(c.relname,'v4_')) THEN 'CHUA_CO_MODULE: sau backup, dung 01_CAI_MODULE_MOI_TREN_CSDL_TKB.sql'
 WHEN to_regprocedure('public.v4_save_lesson_review(uuid,text)') IS NOT NULL AND to_regprocedure('public.v4_credentials_ready()') IS NOT NULL THEN 'DA_CO_DAU_MOC_20: doi chieu schema/RLS va backup; dung 02_CAP_NHAT_TU_20_LEN_21.sql'
 ELSE 'DA_CO_MODULE_MOT_PHAN: doi chieu cac buoc trong SQL/steps, KHONG chay lai 01.'
 END AS suggested_path;
-- Day chi la dau moc schema, KHONG thay the lich su migration/backup hoac test JWT that.
