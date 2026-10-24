-- Read-only verification after 01 -> 03 -> 05 -> 06 on the target database.
-- Does not create test users or change data. Offline evidence does not imply live deployment.
SELECT name,to_regprocedure(name) IS NOT NULL AS present
FROM unnest(ARRAY[
 'public.v4_set_group_count(text,text,integer)',
 'public.v4_confirm_layout(text,text)',
 'public.v4_sync_published_tkb()',
 'public.v4_actual_class_access(text,text)',
 'public.v4_observation_edit_history(uuid)'
]) name;

SELECT tablename,rowsecurity FROM pg_tables
WHERE schemaname='public' AND tablename LIKE 'v4_%' ORDER BY tablename;

SELECT l.school_year,l.class_code,jsonb_array_length(l.desk_counts) AS group_count,
 public.v4_valid_desks(l.desk_counts) AS valid_desks,l.is_confirmed,
 count(s.student_id) FILTER(WHERE s.group_no>jsonb_array_length(l.desk_counts)
  OR s.desk_no>(l.desk_counts->>(s.group_no-1))::integer) AS invalid_positions
FROM public.v4_layouts l LEFT JOIN public.v4_seats s
 ON s.school_year=l.school_year AND s.class_code=l.class_code
GROUP BY l.school_year,l.class_code,l.desk_counts,l.is_confirmed;

-- Manual grants require explicit review when PCCM changes; this does not revoke them.
SELECT ca.user_id,ca.school_year,ca.class_code,ca.role,
 CASE WHEN aut.user_id IS NULL THEN 'manual' ELSE 'tkb_auto' END AS source,aut.version_id
FROM public.v4_class_access ca LEFT JOIN public.v4_tkb_auto_grants aut
 USING(user_id,school_year,class_code,role)
ORDER BY ca.school_year,ca.class_code,ca.role,ca.user_id;

SELECT table_name,operation,count(*) AS changes FROM public.v4_audit
WHERE table_name IN('v4_class_access','v4_teachers') GROUP BY table_name,operation;

SELECT tablename,policyname,cmd,qual,with_check FROM pg_policies
WHERE schemaname='public' AND tablename IN
 ('v4_sessions','v4_attendance','v4_observations','v4_layouts','v4_seats')
ORDER BY tablename,policyname;
