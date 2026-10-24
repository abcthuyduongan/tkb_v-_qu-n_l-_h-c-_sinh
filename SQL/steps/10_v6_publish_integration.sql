-- One publish action updates the timetable and attempts verified PCCM synchronization.
-- Unresolved identities remain explicitly pending; no guessed permissions are created.
BEGIN;
CREATE TABLE IF NOT EXISTS public.v4_tkb_sync_state(
 version_id uuid PRIMARY KEY REFERENCES public.tkb_versions(id) ON DELETE CASCADE,
 status text NOT NULL CHECK(status IN('pending','synced')),
 reason text NOT NULL DEFAULT '',
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by uuid REFERENCES auth.users(id)
);
ALTER TABLE public.v4_tkb_sync_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS v4_tkb_sync_state_admin ON public.v4_tkb_sync_state;
CREATE POLICY v4_tkb_sync_state_admin ON public.v4_tkb_sync_state FOR SELECT TO authenticated USING(public.v4_admin());
REVOKE ALL ON public.v4_tkb_sync_state FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.v4_tkb_sync_state TO authenticated;

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
 VALUES(current_id,CASE WHEN (result->>'applied')::boolean THEN 'synced' ELSE 'pending' END,coalesce(result->>'reason',''),auth.uid())
 ON CONFLICT(version_id) DO UPDATE SET status=excluded.status,reason=excluded.reason,updated_at=now(),updated_by=auth.uid();
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.v4_publish_timetable(target_version text,expected_current text,sync_permissions boolean DEFAULT true) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE target public.tkb_versions%rowtype; current_id text; result jsonb;
BEGIN
 IF NOT public.v4_admin() THEN RAISE EXCEPTION 'Chỉ quản trị được công bố TKB'; END IF;
 PERFORM pg_advisory_xact_lock(7642026);
 SELECT id::text INTO current_id FROM public.tkb_versions WHERE is_active LIMIT 1 FOR UPDATE;
 IF current_id IS DISTINCT FROM nullif(expected_current,'') THEN RAISE EXCEPTION 'TKB đang dùng đã thay đổi; hãy làm mới trước khi công bố'; END IF;
 SELECT * INTO target FROM public.tkb_versions WHERE id::text=target_version FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy bản TKB'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.tkb_entries WHERE version_id=target.id) THEN RAISE EXCEPTION 'TKB chưa có tiết học'; END IF;
 UPDATE public.tkb_versions SET is_active=false WHERE is_active;
 UPDATE public.tkb_versions SET status='published',is_active=true,published_at=now() WHERE id=target.id;
 IF sync_permissions THEN
  -- A malformed PCCM cannot silently change any permissions. The schedule remains
  -- available while Admin resolves the explicit pending state.
  BEGIN result=public.v4_apply_tkb_preview(target.id::text);
  EXCEPTION WHEN OTHERS THEN
   result=jsonb_build_object('applied',false,'reason',SQLERRM,'added',0,'removed',0);
   INSERT INTO public.v4_tkb_sync_state(version_id,status,reason,updated_by) VALUES(target.id,'pending',SQLERRM,auth.uid())
   ON CONFLICT(version_id) DO UPDATE SET status='pending',reason=excluded.reason,updated_at=now(),updated_by=auth.uid();
  END;
 ELSE
  result=jsonb_build_object('applied',false,'reason','Chờ quản trị xác nhận quyền','added',0,'removed',0);
  INSERT INTO public.v4_tkb_sync_state(version_id,status,reason,updated_by) VALUES(target.id,'pending','Chờ quản trị xác nhận quyền',auth.uid())
  ON CONFLICT(version_id) DO UPDATE SET status='pending',reason=excluded.reason,updated_at=now(),updated_by=auth.uid();
 END IF;
 RETURN jsonb_build_object('published',true,'version_id',target.id,'sync',result);
END $$;
REVOKE ALL ON FUNCTION public.v4_publish_timetable(text,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v4_publish_timetable(text,text,boolean) TO authenticated;
COMMIT;
