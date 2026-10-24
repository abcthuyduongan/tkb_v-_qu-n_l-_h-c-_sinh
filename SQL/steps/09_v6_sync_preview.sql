-- Read-only permission diff and version-checked apply. After 01,03,05,06,08.
BEGIN;
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
 ELSIF jsonb_array_length(unresolved)>0 THEN reason='Có giáo viên/PCCM chưa được liên kết tài khoản';
 ELSIF EXISTS(SELECT 1 FROM jsonb_array_elements(desired) d WHERE d->>'role'='gvcn'
  GROUP BY d->>'school_year',d->>'class_code' HAVING count(*)>1) THEN reason='PCCM chứa nhiều GVCN cho một lớp'; END IF;
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
 RETURN jsonb_build_object('version_id',v.id,'version_name',v.version_name,'school_year',v.school_year,'ready',reason='',
  'reason',reason,'added',added,'removed',removed,'manual',manual,'unresolved',unresolved);
END $$;
CREATE OR REPLACE FUNCTION public.v4_apply_tkb_preview(expected_version text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE current_id text;
BEGIN
 IF NOT public.v4_admin() THEN RAISE EXCEPTION 'Chỉ quản trị được đồng bộ PCCM'; END IF;
 PERFORM pg_advisory_xact_lock(7642026);
 SELECT id::text INTO current_id FROM public.tkb_versions WHERE status='published' AND is_active ORDER BY published_at DESC LIMIT 1 FOR SHARE;
 IF current_id IS NULL OR expected_version IS NULL OR current_id<>expected_version THEN RAISE EXCEPTION 'TKB đã thay đổi; cần xem lại đối chiếu trước khi đồng bộ'; END IF;
 RETURN public.v4_sync_published_tkb();
END $$;
REVOKE ALL ON FUNCTION public.v4_preview_published_tkb(),public.v4_apply_tkb_preview(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v4_preview_published_tkb(),public.v4_apply_tkb_preview(text) TO authenticated;
COMMIT;
