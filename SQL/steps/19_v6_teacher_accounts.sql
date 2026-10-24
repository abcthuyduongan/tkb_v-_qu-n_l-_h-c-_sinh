-- Teacher profiles and account audit. Auth passwords stay in Supabase Auth only.
-- Apply after17. 18_readiness_preflight.sql is read-only.
BEGIN;
CREATE OR REPLACE FUNCTION public.v4_credentials_ready() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.uid() IS NOT NULL AND NOT coalesce((SELECT (u.raw_app_meta_data->>'force_password_change')::boolean FROM auth.users u WHERE u.id=auth.uid()),false)
$$;
REVOKE ALL ON FUNCTION public.v4_credentials_ready() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.v4_credentials_ready() TO authenticated;
CREATE OR REPLACE FUNCTION public.v4_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.v4_credentials_ready() AND coalesce(public.is_tkb_admin(),false)
$$;
CREATE OR REPLACE FUNCTION public.v4_actual_class_access(y text,c text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.v4_credentials_ready() AND EXISTS(SELECT 1 FROM public.v4_class_access WHERE user_id=auth.uid() AND school_year=y AND class_code=c)
$$;
CREATE OR REPLACE FUNCTION public.v4_actual_homeroom(y text,c text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.v4_credentials_ready() AND EXISTS(SELECT 1 FROM public.v4_class_access WHERE user_id=auth.uid() AND school_year=y AND class_code=c AND role='gvcn')
$$;
-- Legacy SECURITY DEFINER reports also use these helpers, bypassing table RLS.
CREATE OR REPLACE FUNCTION public.v4_has_class(y text,c text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.v4_credentials_ready() AND (public.v4_admin() OR public.v4_actual_class_access(y,c))
$$;
CREATE OR REPLACE FUNCTION public.v4_homeroom(y text,c text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.v4_credentials_ready() AND (public.v4_admin() OR public.v4_actual_homeroom(y,c))
$$;
CREATE OR REPLACE FUNCTION public.v4_health_access(y text,c text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.v4_actual_class_access(y,c)
$$;
CREATE OR REPLACE FUNCTION public.v4_shared_teacher(uid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.v4_credentials_ready() AND EXISTS(
  SELECT 1 FROM public.v4_class_access a JOIN public.v4_class_access b
   ON a.school_year=b.school_year AND a.class_code=b.class_code
  WHERE a.user_id=auth.uid() AND b.user_id=uid)
$$;
-- Colleagues may read teacher names/codes, never private contact information.
CREATE TABLE IF NOT EXISTS public.v4_teacher_profiles(
 user_id uuid PRIMARY KEY REFERENCES public.v4_teachers(user_id) ON DELETE CASCADE,
 phone text NOT NULL DEFAULT '',specialty text NOT NULL DEFAULT '',
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.v4_teacher_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS v4_teacher_profile_read ON public.v4_teacher_profiles;
CREATE POLICY v4_teacher_profile_read ON public.v4_teacher_profiles FOR SELECT TO authenticated
 USING(user_id=auth.uid() OR public.v4_admin());
REVOKE ALL ON public.v4_teacher_profiles FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.v4_teacher_profiles TO authenticated;
CREATE TABLE IF NOT EXISTS public.v4_teacher_logins(
 user_id uuid PRIMARY KEY REFERENCES public.v4_teachers(user_id) ON DELETE CASCADE,
 username text NOT NULL UNIQUE CHECK(username ~ '^[a-z][a-z0-9._-]{2,39}$'),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.v4_teacher_logins ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS v4_teacher_login_read ON public.v4_teacher_logins;
CREATE POLICY v4_teacher_login_read ON public.v4_teacher_logins FOR SELECT TO authenticated
 USING(user_id=auth.uid() OR public.v4_admin());
REVOKE ALL ON public.v4_teacher_logins FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.v4_teacher_logins TO authenticated;
DO $$ DECLARE item record; BEGIN
 FOR item IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity AND (c.relname LIKE 'v4_%' OR c.relname LIKE 'tkb_%') LOOP
  EXECUTE format('DROP POLICY IF EXISTS v4_password_ready ON public.%I',item.relname);
  EXECUTE format('CREATE POLICY v4_password_ready ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.v4_credentials_ready())) WITH CHECK((SELECT public.v4_credentials_ready()))',item.relname);
 END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS public.v4_teacher_account_events(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actor_id uuid NOT NULL REFERENCES auth.users(id),target_id uuid NOT NULL REFERENCES auth.users(id),
 action text NOT NULL CHECK(action IN('account_created','password_reset','password_changed')),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.v4_teacher_account_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS v4_account_event_read ON public.v4_teacher_account_events;
CREATE POLICY v4_account_event_read ON public.v4_teacher_account_events FOR SELECT TO authenticated USING(public.v4_admin() OR target_id=auth.uid());
GRANT SELECT ON public.v4_teacher_account_events TO authenticated;
GRANT SELECT,INSERT ON public.v4_teacher_account_events TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.v4_teacher_account_events_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.v4_teacher_directory(y text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE version text; result jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Cần đăng nhập'; END IF;
 SELECT v.id::text INTO version FROM public.tkb_versions v WHERE v.school_year=y AND v.is_active AND v.status='published' ORDER BY v.published_at DESC LIMIT 1;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'user_id',t.user_id,'teacher_code',t.teacher_code,'teacher_name',t.teacher_name,
  'username',coalesce(l.username,u.email),'email',CASE WHEN l.user_id IS NULL THEN u.email ELSE '' END,
  'phone',coalesce(p.phone,''),'specialty',coalesce(p.specialty,''),'created_at',t.created_at,
  'force_password_change',coalesce((u.raw_app_meta_data->>'force_password_change')::boolean,false),
  'subjects',(SELECT coalesce(jsonb_agg(q.subject ORDER BY q.subject),'[]') FROM(SELECT DISTINCT e.subject FROM public.tkb_entries e WHERE e.version_id::text=version AND e.teacher_code=t.teacher_code)q),
  'teaching_classes',(SELECT coalesce(jsonb_agg(q.class_code ORDER BY q.class_code),'[]') FROM(SELECT DISTINCT e.class_code FROM public.tkb_entries e WHERE e.version_id::text=version AND e.teacher_code=t.teacher_code)q),
  'homeroom_classes',(SELECT coalesce(jsonb_agg(c.class_code ORDER BY c.class_code),'[]') FROM public.v4_class_access c WHERE c.user_id=t.user_id AND c.school_year=y AND c.role='gvcn')
 ) ORDER BY t.teacher_name),'[]') INTO result FROM public.v4_teachers t JOIN auth.users u ON u.id=t.user_id
 LEFT JOIN public.v4_teacher_profiles p ON p.user_id=t.user_id LEFT JOIN public.v4_teacher_logins l ON l.user_id=t.user_id WHERE public.v4_admin() OR t.user_id=auth.uid();
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.v4_register_teacher_login(target uuid,login_name text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.v4_admin() THEN RAISE EXCEPTION 'Chỉ quản trị được cấp tên đăng nhập'; END IF;
 IF login_name IS NULL OR login_name !~ '^[a-z][a-z0-9._-]{2,39}$' THEN RAISE EXCEPTION 'Tên đăng nhập không hợp lệ'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.v4_teachers t JOIN auth.users u ON u.id=t.user_id
   WHERE t.user_id=target AND u.email='tp.'||login_name||'@accounts.tranphu.invalid') THEN
  RAISE EXCEPTION 'Tên đăng nhập chưa khớp tài khoản xác thực';
 END IF;
 INSERT INTO public.v4_teacher_logins(user_id,username) VALUES(target,login_name);
END $$;
CREATE OR REPLACE FUNCTION public.v4_teacher_catalog(y text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE version text;
BEGIN
 IF NOT public.v4_admin() THEN RAISE EXCEPTION 'Chỉ quản trị được quản lý tài khoản giáo viên'; END IF;
 SELECT v.id::text INTO version FROM public.tkb_versions v WHERE v.school_year=y AND v.status='published' AND v.is_active ORDER BY v.published_at DESC LIMIT 1;
 RETURN jsonb_build_object('version_id',version,
  'entries',(SELECT coalesce(jsonb_agg(jsonb_build_object('teacher_code',e.teacher_code,'teacher_name',e.teacher_name,'class_code',e.class_code,'subject',e.subject)),'[]') FROM public.tkb_entries e WHERE e.version_id::text=version),
  'assignments',(SELECT coalesce(jsonb_agg(to_jsonb(a)),'[]') FROM public.tkb_assignments a WHERE a.version_id::text=version));
END $$;
CREATE OR REPLACE FUNCTION public.v4_update_teacher_profile(target uuid,fullname text,p_phone text,p_specialty text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE current_name text;
BEGIN
 IF target IS NULL OR NOT public.v4_credentials_ready() OR (target<>auth.uid() AND NOT public.v4_admin()) THEN RAISE EXCEPTION 'Không có quyền sửa hồ sơ'; END IF;
 SELECT teacher_name INTO current_name FROM public.v4_teachers WHERE user_id=target FOR UPDATE;
 IF current_name IS NULL THEN RAISE EXCEPTION 'Không có hồ sơ giáo viên'; END IF;
 IF NOT public.v4_admin() AND btrim(fullname)<>current_name THEN RAISE EXCEPTION 'Liên hệ quản trị để sửa họ tên định danh'; END IF;
 IF length(btrim(coalesce(fullname,''))) NOT BETWEEN 2 AND 120 OR length(coalesce(p_phone,''))>30 OR length(coalesce(p_specialty,''))>150 THEN RAISE EXCEPTION 'Thông tin hồ sơ không hợp lệ'; END IF;
 IF coalesce(p_phone,'') !~ '^[0-9+(). -]*$' THEN RAISE EXCEPTION 'Số điện thoại không hợp lệ'; END IF;
 UPDATE public.v4_teachers SET teacher_name=btrim(fullname) WHERE user_id=target AND teacher_name IS DISTINCT FROM btrim(fullname);
 INSERT INTO public.v4_teacher_profiles(user_id,phone,specialty,updated_at)
  VALUES(target,btrim(coalesce(p_phone,'')),btrim(coalesce(p_specialty,'')),statement_timestamp())
  ON CONFLICT(user_id) DO UPDATE SET phone=excluded.phone,specialty=excluded.specialty,updated_at=excluded.updated_at;
END $$;
REVOKE ALL ON FUNCTION public.v4_teacher_directory(text),public.v4_teacher_catalog(text),public.v4_update_teacher_profile(uuid,text,text,text),public.v4_register_teacher_login(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.v4_teacher_directory(text),public.v4_teacher_catalog(text),public.v4_update_teacher_profile(uuid,text,text,text),public.v4_register_teacher_login(uuid,text) TO authenticated;
COMMIT;
