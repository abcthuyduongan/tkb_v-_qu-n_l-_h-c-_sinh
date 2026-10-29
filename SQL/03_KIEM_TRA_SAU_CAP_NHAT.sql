-- Chi doc. Can2 ham, security_definer=false, anon_execute=false, authenticated_execute=true.
SELECT p.proname,pg_get_function_identity_arguments(p.oid) AS parameters,
 p.prosecdef AS security_definer,has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN('v4_daily_learning','v4_lesson_handoffs') ORDER BY p.proname;
SELECT c.relname AS table_name,c.relrowsecurity AS rls_enabled FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND starts_with(c.relname,'v4_') ORDER BY c.relname;
SELECT public.v4_school_today() AS school_today,statement_timestamp() AS server_now;
SELECT position('tuần hiện tại hoặc các tuần trước' in pg_get_functiondef(to_regprocedure('public.v4_lesson_handoffs(text,text,date,date,text)'))) > 0 AS weekly_history_installed;
SELECT position('linked-add-only' in pg_get_functiondef(to_regprocedure('public.v4_preview_published_tkb()'))) > 0 AS linked_account_sync_installed;
-- Can2 dong, excludes_admin=true; doi chieu them bang tai khoan admin/GV that.
SELECT p.proname,position('NOT public.v4_admin()' in pg_get_functiondef(p.oid))>0 AS excludes_admin,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN('v4_actual_class_access','v4_actual_homeroom');
SELECT category,behavior_code,active FROM public.v4_behaviors WHERE lower(btrim(behavior_code))='xuất sắc';
-- Five guarded management RPCs must have SECURITY DEFINER=true, anon=false, authenticated=true.
SELECT x.signature,p.oid IS NOT NULL AS installed,p.prosecdef AS security_definer,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute
FROM (VALUES('public.v4_save_student(text,text,text,text,text,date,uuid,jsonb)'),('public.v4_set_student_active(text,text,uuid,boolean)'),('public.v4_save_timetable_draft(jsonb,jsonb,jsonb,uuid,timestamptz)'),('public.v4_set_timetable_metadata(uuid,integer,date,timestamptz)'),('public.v4_activate_timetable(uuid,timestamptz,text)')) AS x(signature)
LEFT JOIN pg_proc p ON p.oid=to_regprocedure(x.signature);
SELECT position('learning_groups' in pg_get_functiondef(to_regprocedure('public.v4_lesson_handoffs(text,text,date,date,text)')))>0 AS lesson_highlights_installed,
 position('target.effective_date>public.v4_school_today()' in pg_get_functiondef(to_regprocedure('public.v4_publish_timetable(text,text,boolean)')))>0 AS future_timetable_guard_installed;
SELECT p.proname,has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute
FROM pg_proc p WHERE p.oid=to_regprocedure('public.v4_invalidate_layout_on_roster_change()');
SELECT to_regprocedure('public.v4_overview(text,date,date,text)') IS NOT NULL AS overview_installed, to_regprocedure('public.v4_confirm_attendance(uuid,jsonb)') IS NOT NULL AS confirmation_installed;
SELECT has_function_privilege('anon',to_regprocedure('public.v4_overview(text,date,date,text)'),'EXECUTE') AS anon_overview_must_be_false, has_function_privilege('authenticated',to_regprocedure('public.v4_completion_rows(text,text,date,date,text)'),'EXECUTE') AS direct_internal_access_must_be_false;
SELECT to_regprocedure('public.v4_can_arrange_seats(text,text)') IS NOT NULL AS admin_seating_installed;
-- Feedback: 3 rows installed=true, security_definer=true, authenticated_execute=true.
-- Only submit has anon_execute=true. All direct table privileges below must be false.
SELECT x.signature,p.oid IS NOT NULL AS installed,p.prosecdef AS security_definer,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute
FROM (VALUES('public.v4_submit_feedback(text,text,text,text,text)'),('public.v4_get_feedback(text)'),('public.v4_update_feedback(uuid,text,text)')) x(signature)
LEFT JOIN pg_proc p ON p.oid=to_regprocedure(x.signature);
SELECT coalesce(position('feedback_guard_v2' in pg_get_functiondef(to_regprocedure('public.v4_submit_feedback(text,text,text,text,text)')))>0,false) AS feedback_guard_v2_installed;
SELECT r.rolname,c.relrowsecurity AS rls_enabled,
 has_table_privilege(r.oid,c.oid,'SELECT') AS direct_select_must_be_false,
 has_table_privilege(r.oid,c.oid,'INSERT') AS direct_insert_must_be_false,
 has_table_privilege(r.oid,c.oid,'UPDATE') AS direct_update_must_be_false,
 has_table_privilege(r.oid,c.oid,'DELETE') AS direct_delete_must_be_false
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN pg_roles r
WHERE n.nspname='public' AND c.relname='v4_feedback' AND r.rolname IN ('anon','authenticated');
-- Weekly rotation: two installed RPCs, anon=false/authenticated=true; reader invoker, writer definer.
SELECT x.signature,p.oid IS NOT NULL AS installed,p.prosecdef AS security_definer,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute
FROM (VALUES('public.v4_get_seating_rotation(text,text)'),('public.v4_save_seating_rotation(text,text,jsonb,integer,timestamptz)')) x(signature)
LEFT JOIN pg_proc p ON p.oid=to_regprocedure(x.signature);
SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='v4_layouts' AND column_name IN ('rotation_config','rotation_revision');
-- Review correction: same-day guard applies to observation UPDATE, not only INSERT.
SELECT coalesce(position('IF NOT public.v4_check_lesson_writable' in pg_get_functiondef(to_regprocedure('public.v4_same_day_observation_guard()')))>0,false) AS correction_guard_installed;
SELECT x.signature,p.oid IS NOT NULL AS installed,p.prosecdef AS security_definer,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute
FROM (VALUES('public.v4_withdraw_observation(uuid,text,timestamptz)'),('public.v4_withdrawn_observations(uuid)'),('public.v4_my_lesson_week(text,date)')) x(signature)
LEFT JOIN pg_proc p ON p.oid=to_regprocedure(x.signature);
SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='v4_observations' AND column_name IN('withdrawn_at','withdrawn_by','withdrawal_reason');
SELECT policyname,permissive,cmd FROM pg_policies WHERE schemaname='public' AND tablename='v4_observations' AND policyname='v4_obs_effective';
SELECT has_table_privilege('authenticated','public.v4_observations','UPDATE') AS table_update_must_be_false,
 has_column_privilege('authenticated','public.v4_observations','note','UPDATE') AS note_update_must_be_true,
 CASE WHEN EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='v4_observations' AND column_name='withdrawn_at') THEN has_column_privilege('authenticated','public.v4_observations','withdrawn_at','UPDATE') END AS withdrawal_update_must_be_false;
-- Atomic seating: reader invoker, writer definer; both anon=false/authenticated=true.
SELECT x.signature,p.oid IS NOT NULL AS installed,p.prosecdef AS security_definer,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
 p.proconfig AS function_settings
FROM (VALUES('public.v4_get_seating_workspace(text,text)'),('public.v4_apply_seating_change(text,text,uuid,text,jsonb,uuid)')) x(signature)
LEFT JOIN pg_proc p ON p.oid=to_regprocedure(x.signature);
SELECT column_name,data_type,is_nullable FROM information_schema.columns
WHERE table_schema='public' AND table_name='v4_layouts' AND column_name='seating_revision';
SELECT tgname,tgenabled FROM pg_trigger WHERE tgrelid=to_regclass('public.v4_layouts') AND tgname='v4_seating_revision_guard';
-- Receipts: two rows, RLS=true and all direct privileges=false. No receipt content is read.
SELECT r.rolname,c.relrowsecurity AS rls_enabled,
 has_table_privilege(r.oid,c.oid,'SELECT') AS direct_select_must_be_false,
 has_table_privilege(r.oid,c.oid,'INSERT') AS direct_insert_must_be_false,
 has_table_privilege(r.oid,c.oid,'UPDATE') AS direct_update_must_be_false,
 has_table_privilege(r.oid,c.oid,'DELETE') AS direct_delete_must_be_false
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN pg_roles r
WHERE n.nspname='public' AND c.relname='v4_seating_actions' AND r.rolname IN ('anon','authenticated');
-- SQL Editor khong dai dien JWT giao vien. Sau day van can test dang nhap/phan quyen that.
