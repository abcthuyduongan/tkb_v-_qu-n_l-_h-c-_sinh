-- Apply after23. Adds verified account permissions while unregistered teachers remain pending.
-- Does not provision accounts, rewrite teacher identities, or remove historical data.
BEGIN;
DO $guard$ BEGIN
 IF to_regprocedure('public.v4_lesson_handoffs(text,text,date,date,text)') IS NULL
 OR to_regclass('public.v4_tkb_sync_state') IS NULL THEN RAISE EXCEPTION 'Cần hoàn tất module đến23 trước khi cập nhật đồng bộ'; END IF;
 IF position('NOT public.v4_admin()' in pg_get_functiondef('public.v4_actual_class_access(text,text)'::regprocedure))=0 THEN RAISE EXCEPTION 'Cần bước23 tách tài khoản quản trị/giáo viên trước'; END IF;
END $guard$;
CREATE OR REPLACE FUNCTION public.v4_preview_published_tkb() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v record; desired jsonb; unresolved jsonb; added jsonb; removed jsonb; manual jsonb; reason text:='';
BEGIN
 IF NOT public.v4_admin() THEN RAISE EXCEPTION 'Chỉ quản trị được đối chiếu quyền'; END IF;
 SELECT id,school_year,version_name INTO v FROM public.tkb_versions WHERE status='published' AND is_active ORDER BY published_at DESC LIMIT 1;
 IF NOT FOUND THEN RETURN jsonb_build_object('ready',false,'reason','Chưa có TKB đã công bố'); END IF;
 WITH subject_grants AS (
  SELECT DISTINCT t.user_id,v.school_year AS school_year,e.class_code,'gvbm'::text AS role
  FROM public.tkb_entries e JOIN public.v4_teachers t ON t.teacher_code=e.teacher_code WHERE e.version_id=v.id
 ), homerooms AS (
  SELECT a.homeroom_class AS class_code,min(t.user_id::text)::uuid AS user_id
  FROM public.tkb_assignments a JOIN public.v4_teachers t
   ON lower(regexp_replace(btrim(t.teacher_name),'\s+',' ','g'))=lower(regexp_replace(btrim(a.teacher_name),'\s+',' ','g'))
  WHERE a.version_id=v.id AND nullif(btrim(a.homeroom_class),'') IS NOT NULL
  GROUP BY a.homeroom_class,a.teacher_name HAVING count(t.user_id)=1
 ), all_grants AS (
  SELECT * FROM subject_grants UNION SELECT user_id,v.school_year,class_code,'gvcn' FROM homerooms
 ) SELECT coalesce(jsonb_agg(to_jsonb(g)),'[]'::jsonb) INTO desired FROM all_grants g;
 SELECT coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb) INTO unresolved FROM (
  SELECT DISTINCT 'gvbm' AS type,e.teacher_code AS teacher,e.class_code
  FROM public.tkb_entries e LEFT JOIN public.v4_teachers t ON t.teacher_code=e.teacher_code
  WHERE e.version_id=v.id AND nullif(btrim(e.teacher_code),'') IS NOT NULL AND t.user_id IS NULL
  UNION ALL
  SELECT 'gvcn',a.teacher_name,a.homeroom_class FROM public.tkb_assignments a
  LEFT JOIN public.v4_teachers t ON lower(regexp_replace(btrim(t.teacher_name),'\s+',' ','g'))=lower(regexp_replace(btrim(a.teacher_name),'\s+',' ','g'))
  WHERE a.version_id=v.id AND nullif(btrim(a.homeroom_class),'') IS NOT NULL
  GROUP BY a.teacher_name,a.homeroom_class HAVING count(t.user_id)<>1
 ) p;
 IF NOT EXISTS(SELECT 1 FROM public.tkb_assignments WHERE version_id=v.id) THEN reason='Phiên bản TKB chưa có dữ liệu PCCM/GVCN';
 ELSIF EXISTS(SELECT 1 FROM public.tkb_entries e WHERE e.version_id=v.id AND NOT EXISTS(
   SELECT 1 FROM public.tkb_assignments a WHERE a.version_id=v.id AND btrim(a.homeroom_class)=btrim(e.class_code))) THEN reason='Chưa có GVCN trong PCCM cho đủ các lớp';
 
 ELSIF EXISTS(SELECT 1 FROM jsonb_array_elements(desired) d WHERE d->>'role'='gvcn'
  GROUP BY d->>'school_year',d->>'class_code' HAVING count(*)>1) THEN reason='PCCM chứa nhiều GVCN cho một lớp'; END IF;
 IF EXISTS(SELECT 1 FROM public.tkb_assignments a WHERE a.version_id=v.id AND nullif(btrim(a.homeroom_class),'') IS NOT NULL
  GROUP BY btrim(a.homeroom_class) HAVING count(DISTINCT lower(regexp_replace(btrim(a.teacher_name),'\s+',' ','g')))>1) THEN reason='PCCM chứa nhiều GVCN cho một lớp'; END IF;
 IF EXISTS(SELECT 1 FROM public.tkb_assignments a WHERE a.version_id=v.id AND nullif(btrim(a.homeroom_class),'') IS NOT NULL
  AND (SELECT count(*) FROM public.v4_teachers t WHERE lower(regexp_replace(btrim(t.teacher_name),'\s+',' ','g'))=lower(regexp_replace(btrim(a.teacher_name),'\s+',' ','g')))>1) THEN reason='Có nhiều tài khoản trùng tên GVCN; cần đối chiếu'; END IF;
 IF NOT public.v4_school_year_valid(v.school_year) THEN reason='Năm học TKB chưa đúng chuẩn; cần đối chiếu trước khi đồng bộ'; END IF;
 IF (SELECT count(*) FROM public.tkb_versions WHERE status='published' AND is_active)<>1 THEN reason='Cần đúng một TKB đang công bố'; END IF;
 SELECT coalesce(jsonb_agg(d),'[]'::jsonb) INTO added FROM jsonb_array_elements(desired) d WHERE NOT EXISTS(
  SELECT 1 FROM public.v4_class_access a WHERE a.user_id::text=d->>'user_id' AND a.school_year=d->>'school_year' AND a.class_code=d->>'class_code' AND a.role=d->>'role');
 SELECT coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb) INTO removed FROM public.v4_tkb_auto_grants a WHERE a.school_year=v.school_year AND NOT EXISTS(
  SELECT 1 FROM jsonb_array_elements(desired) d WHERE a.user_id::text=d->>'user_id' AND a.school_year=d->>'school_year' AND a.class_code=d->>'class_code' AND a.role=d->>'role');
 SELECT coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb) INTO manual FROM public.v4_class_access a WHERE a.school_year=v.school_year AND NOT EXISTS(
  SELECT 1 FROM public.v4_tkb_auto_grants aut WHERE aut.user_id=a.user_id AND aut.school_year=a.school_year AND aut.class_code=a.class_code AND aut.role=a.role);
 IF reason='' AND EXISTS(SELECT 1 FROM jsonb_array_elements(manual) a JOIN jsonb_array_elements(desired) d
  ON a->>'school_year'=d->>'school_year' AND a->>'class_code'=d->>'class_code' AND a->>'role'='gvcn' AND d->>'role'='gvcn' AND a->>'user_id'<>d->>'user_id') THEN
  reason='GVCN được cấp thủ công đang khác PCCM; quản trị phải đối chiếu';
 END IF;
 IF jsonb_array_length(unresolved)>0 THEN
  IF reason='' AND EXISTS(SELECT 1 FROM jsonb_array_elements(desired) d JOIN public.v4_class_access a
   ON a.school_year=d->>'school_year' AND a.class_code=d->>'class_code' AND a.role='gvcn'
   WHERE d->>'role'='gvcn' AND a.user_id::text<>d->>'user_id') THEN
   reason='Đổi GVCN cần hoàn tất đối chiếu trước khi thu hồi quyền cũ';
  END IF;
  removed='[]'::jsonb;
  IF reason='' AND jsonb_array_length(desired)=0 THEN reason='Chưa có tài khoản giáo viên đã liên kết để đồng bộ'; END IF;
 END IF;
 RETURN jsonb_build_object('version_id',v.id,'version_name',v.version_name,'school_year',v.school_year,'ready',reason='',
  'sync_mode','linked-add-only','partial',jsonb_array_length(unresolved)>0,'desired',desired,
  'reason',reason,'added',added,'removed',removed,'manual',manual,'unresolved',unresolved);
END $$;

CREATE OR REPLACE FUNCTION public.v4_sync_published_tkb() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p jsonb; r jsonb; inserted_rows integer; added integer:=0; removed integer:=0;
BEGIN
 IF NOT public.v4_admin() THEN RAISE EXCEPTION 'Chỉ quản trị được đồng bộ PCCM'; END IF;
 PERFORM pg_advisory_xact_lock(7642026);
 p=public.v4_preview_published_tkb();
 IF NOT coalesce((p->>'ready')::boolean,false) THEN
  RETURN jsonb_build_object('applied',false,'reason',p->>'reason','added',0,'removed',0,'unresolved',coalesce(p->'unresolved','[]'::jsonb));
 END IF;
 -- Preview suppresses all revocations while any teacher identity is pending.
 FOR r IN SELECT value FROM jsonb_array_elements(p->'removed') LOOP
  DELETE FROM public.v4_class_access WHERE user_id=(r->>'user_id')::uuid AND school_year=r->>'school_year' AND class_code=r->>'class_code' AND role=r->>'role';
  DELETE FROM public.v4_tkb_auto_grants WHERE user_id=(r->>'user_id')::uuid AND school_year=r->>'school_year' AND class_code=r->>'class_code' AND role=r->>'role';
  IF r->>'role'='gvcn' THEN UPDATE public.v4_layouts SET is_confirmed=false,updated_at=now() WHERE school_year=r->>'school_year' AND class_code=r->>'class_code'; END IF;
  removed=removed+1;
 END LOOP;
 FOR r IN SELECT value FROM jsonb_array_elements(p->'desired') LOOP
  INSERT INTO public.v4_class_access(user_id,school_year,class_code,role) VALUES((r->>'user_id')::uuid,r->>'school_year',r->>'class_code',r->>'role') ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS inserted_rows=ROW_COUNT;
  IF inserted_rows>0 THEN
   added=added+1;
   IF r->>'role'='gvcn' THEN UPDATE public.v4_layouts SET is_confirmed=false,updated_at=now() WHERE school_year=r->>'school_year' AND class_code=r->>'class_code'; END IF;
   INSERT INTO public.v4_tkb_auto_grants(user_id,school_year,class_code,role,version_id)
   VALUES((r->>'user_id')::uuid,r->>'school_year',r->>'class_code',r->>'role',p->>'version_id')
   ON CONFLICT(user_id,school_year,class_code,role) DO UPDATE SET version_id=excluded.version_id;
  ELSE
   -- Manual grants remain manual; update only ownership records already held by the sync process.
   UPDATE public.v4_tkb_auto_grants SET version_id=p->>'version_id' WHERE user_id=(r->>'user_id')::uuid AND school_year=r->>'school_year' AND class_code=r->>'class_code' AND role=r->>'role';
  END IF;
 END LOOP;
 RETURN jsonb_build_object('applied',true,'version',p->>'version_name','partial',(p->>'partial')::boolean,
  'reason',CASE WHEN (p->>'partial')::boolean THEN 'Đã đồng bộ tài khoản đã liên kết; còn giáo viên chưa có tài khoản. Chưa thu hồi quyền cũ.' ELSE '' END,
  'added',added,'removed',removed,'unresolved',p->'unresolved');
END $$;
CREATE OR REPLACE FUNCTION public.v4_apply_tkb_preview(expected_version text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE current_id uuid; result jsonb;
BEGIN
 IF NOT public.v4_admin() THEN RAISE EXCEPTION 'Chỉ quản trị được đồng bộ PCCM'; END IF;
 PERFORM pg_advisory_xact_lock(7642026);
 SELECT id INTO current_id FROM public.tkb_versions WHERE status='published' AND is_active ORDER BY published_at DESC LIMIT 1 FOR SHARE;
 IF current_id IS NULL OR expected_version IS NULL OR current_id::text<>expected_version THEN RAISE EXCEPTION 'TKB đã thay đổi; cần xem lại đối chiếu trước khi đồng bộ'; END IF;
 result=public.v4_sync_published_tkb();
 INSERT INTO public.v4_tkb_sync_state(version_id,status,reason,updated_by)
 VALUES(current_id,CASE WHEN (result->>'applied')::boolean AND NOT coalesce((result->>'partial')::boolean,false) THEN 'synced' ELSE 'pending' END,coalesce(result->>'reason',''),auth.uid())
 ON CONFLICT(version_id) DO UPDATE SET status=excluded.status,reason=excluded.reason,updated_at=now(),updated_by=auth.uid();
 RETURN result;
END $$;


REVOKE ALL ON FUNCTION public.v4_preview_published_tkb(),public.v4_sync_published_tkb(),public.v4_apply_tkb_preview(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.v4_preview_published_tkb(),public.v4_sync_published_tkb(),public.v4_apply_tkb_preview(text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
