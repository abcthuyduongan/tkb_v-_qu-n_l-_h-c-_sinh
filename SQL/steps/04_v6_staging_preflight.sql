-- READ-ONLY staged checks after 01_v4_new_module.sql + 03_v6_seating_tkb_sync.sql
-- Run on Supabase STAGING as an authorized DB administrator. No live data modifications.
SELECT 'confirm_layout' AS check_name,
       to_regprocedure('public.v4_confirm_layout(text,text)') IS NOT NULL AS present
UNION ALL SELECT 'sync_published_tkb',to_regprocedure('public.v4_sync_published_tkb()') IS NOT NULL
UNION ALL SELECT 'admin_link_teacher',to_regprocedure('public.v4_admin_link_teacher(text,text,text)') IS NOT NULL
UNION ALL SELECT 'actual_class_access',to_regprocedure('public.v4_actual_class_access(text,text)') IS NOT NULL;

SELECT tablename,rowsecurity FROM pg_tables
 WHERE schemaname='public' AND tablename IN
 ('v4_students','v4_seats','v4_layouts','v4_class_access','v4_tkb_auto_grants','v4_sessions','v4_observations')
 ORDER BY tablename;

SELECT school_year,class_code,is_confirmed,confirmed_at,
       (SELECT count(*) FROM public.v4_seats a WHERE a.school_year=l.school_year AND a.class_code=l.class_code) AS filled_seats,
       (SELECT count(*) FROM public.v4_students s WHERE s.school_year=l.school_year AND s.class_code=l.class_code AND s.active) AS active_students
 FROM public.v4_layouts l ORDER BY school_year,class_code;

-- Any PCCM teacher name with no unique linked Auth account must be resolved before permission sync.
SELECT a.homeroom_class,a.teacher_name,count(t.user_id) AS matching_auth_accounts
 FROM public.tkb_assignments a
 JOIN public.tkb_versions v ON v.id=a.version_id AND v.status='published' AND v.is_active=true
 LEFT JOIN public.v4_teachers t
   ON lower(regexp_replace(btrim(t.teacher_name),'\s+',' ','g'))=
      lower(regexp_replace(btrim(a.teacher_name),'\s+',' ','g'))
 WHERE nullif(btrim(a.homeroom_class),'') IS NOT NULL
 GROUP BY a.homeroom_class,a.teacher_name HAVING count(t.user_id)<>1;

SELECT DISTINCT e.teacher_code,e.class_code FROM public.tkb_entries e
 JOIN public.tkb_versions v ON v.id=e.version_id AND v.status='published' AND v.is_active=true
 LEFT JOIN public.v4_teachers t ON t.teacher_code=e.teacher_code
 WHERE nullif(btrim(e.teacher_code),'') IS NOT NULL AND t.user_id IS NULL
 ORDER BY e.teacher_code,e.class_code;

-- Verify no RLS policies accidentally grant student-write authority to v4_admin() alone.
SELECT tablename,policyname,cmd,qual,with_check FROM pg_policies
 WHERE schemaname='public' AND tablename IN
 ('v4_layouts','v4_seats','v4_sessions','v4_observations')
 ORDER BY tablename,policyname;
