BEGIN;
CREATE TABLE IF NOT EXISTS public.v4_account_visits(
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 session_key text NOT NULL,first_seen timestamptz NOT NULL DEFAULT now(),last_seen timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,session_key)
);
ALTER TABLE public.v4_account_visits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.v4_account_visits FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.v4_record_account_visit() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE claims jsonb; session_value text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.v4_credentials_ready() THEN RAISE EXCEPTION 'Cần đăng nhập'; END IF;
 claims:=coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb);
 session_value:=nullif(claims->>'session_id','');
 IF session_value IS NULL THEN RETURN; END IF;
 INSERT INTO public.v4_account_visits(user_id,session_key) VALUES(auth.uid(),session_value)
 ON CONFLICT(user_id,session_key) DO UPDATE SET last_seen=now()
 WHERE public.v4_account_visits.last_seen<now()-interval '2 minutes';
END $$;
CREATE OR REPLACE FUNCTION public.v4_account_activity_summary() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.v4_credentials_ready() OR NOT public.v4_admin() THEN RAISE EXCEPTION 'Chỉ quản trị được xem hoạt động tài khoản'; END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object(
  'user_id',t.user_id,'first_seen',v.first_seen,'last_seen',v.last_seen,'sessions_30d',v.sessions_30d,
  'lessons_30d',(SELECT count(*) FROM public.v4_sessions s WHERE s.teacher_id=t.user_id AND s.lesson_date BETWEEN public.v4_school_today()-29 AND public.v4_school_today()),
  'observations_30d',(SELECT count(*) FROM public.v4_observations o WHERE o.created_by=t.user_id AND o.observed_at>=now()-interval '30 days'),
  'attendance_30d',(SELECT count(*) FROM public.v4_attendance a JOIN public.v4_sessions s ON s.id=a.session_id WHERE s.teacher_id=t.user_id AND s.lesson_date BETWEEN public.v4_school_today()-29 AND public.v4_school_today())
 )) FROM public.v4_teachers t LEFT JOIN LATERAL(
  SELECT min(first_seen) first_seen,max(last_seen) last_seen,count(*) FILTER(WHERE first_seen>=now()-interval '30 days') sessions_30d
  FROM public.v4_account_visits WHERE user_id=t.user_id
 ) v ON true),'[]'::jsonb);
END $$;
CREATE OR REPLACE FUNCTION public.v4_account_visit_history(target uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.v4_credentials_ready() OR NOT public.v4_admin() THEN RAISE EXCEPTION 'Chỉ quản trị được xem lịch sử đăng nhập'; END IF;
 RETURN coalesce((SELECT jsonb_agg(to_jsonb(v)) FROM(
  SELECT first_seen,last_seen FROM public.v4_account_visits WHERE user_id=target ORDER BY first_seen DESC LIMIT 100
 )v),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.v4_record_account_visit(),public.v4_account_activity_summary(),public.v4_account_visit_history(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.v4_record_account_visit(),public.v4_account_activity_summary(),public.v4_account_visit_history(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
