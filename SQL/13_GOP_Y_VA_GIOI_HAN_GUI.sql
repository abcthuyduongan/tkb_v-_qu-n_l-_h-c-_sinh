-- Sau SQL12/module34. Chay ca khi da co SQL35 cu; giu nguyen gop y va du lieu truong.
-- Explicit request27/10: User feedback and suggestions for administrators.
BEGIN;
DO $$ BEGIN IF to_regprocedure('public.v4_can_arrange_seats(text,text)') IS NULL THEN RAISE EXCEPTION 'Cần cập nhật 34 trước 35'; END IF; END $$;

CREATE TABLE IF NOT EXISTS public.v4_feedback(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 created_at timestamptz NOT NULL DEFAULT now(),
 user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 sender_name text,
 sender_role text,
 contact_info text,
 category text NOT NULL DEFAULT 'feature',
 content text NOT NULL,
 status text NOT NULL DEFAULT 'pending',
 admin_notes text,
 resolved_at timestamptz
);

ALTER TABLE public.v4_feedback ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.v4_feedback FROM PUBLIC, anon, authenticated;

-- Function for submitting feedback: open to anon and authenticated
CREATE OR REPLACE FUNCTION public.v4_submit_feedback(
 p_sender_name text,
 p_sender_role text,
 p_contact_info text,
 p_category text,
 p_content text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 v_id uuid;
 v_content text;
 v_sender_name text;
 v_sender_role text;
 v_contact text;
 v_category text;
 v_user_id uuid;
BEGIN
 v_content := trim(coalesce(p_content, ''));
 IF length(v_content) < 5 THEN
   RAISE EXCEPTION 'Nội dung góp ý phải có ít nhất 5 ký tự.';
 END IF;
 IF length(v_content) > 2000 THEN
   RAISE EXCEPTION 'Nội dung góp ý tối đa 2000 ký tự.';
 END IF;

 v_sender_name := nullif(trim(coalesce(p_sender_name, '')), '');
 v_sender_role := nullif(trim(coalesce(p_sender_role, '')), '');
 v_contact     := nullif(trim(coalesce(p_contact_info, '')), '');
 v_category    := coalesce(nullif(trim(coalesce(p_category, '')), ''), 'feature');
 v_user_id     := auth.uid();

 IF coalesce(length(v_sender_name),0)>80 OR coalesce(length(v_sender_role),0)>80
    OR coalesce(length(v_contact),0)>100 THEN
   RAISE EXCEPTION 'Tên/vai trò tối đa 80 ký tự, liên hệ tối đa 100 ký tự.';
 END IF;
 IF v_category NOT IN ('feature','timetable','bug','other') THEN
   RAISE EXCEPTION 'Chủ đề góp ý không hợp lệ.';
 END IF;
 -- feedback_guard_v2: serialize check + insert for each authenticated user.
 -- Anonymous callers share a bucket; never trust a caller-supplied name or IP.
 PERFORM pg_advisory_xact_lock(hashtextextended('v4_feedback:'||coalesce(v_user_id::text,'anonymous'),0));
 IF (SELECT count(*) FROM public.v4_feedback f
     WHERE f.user_id IS NOT DISTINCT FROM v_user_id
       AND f.created_at > clock_timestamp()-interval '10 minutes') >=
       (CASE WHEN v_user_id IS NULL THEN 20 ELSE 5 END) THEN
   RAISE EXCEPTION 'Đã đạt giới hạn góp ý trong 10 phút. Vui lòng thử lại sau.';
 END IF;

 INSERT INTO public.v4_feedback(user_id, sender_name, sender_role, contact_info, category, content, status)
 VALUES (v_user_id, v_sender_name, v_sender_role, v_contact, v_category, v_content, 'pending')
 RETURNING id INTO v_id;

 RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.v4_submit_feedback(text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v4_submit_feedback(text,text,text,text,text) TO anon, authenticated;

-- Function for reading feedback: ONLY ADMIN
CREATE OR REPLACE FUNCTION public.v4_get_feedback(p_status text DEFAULT NULL)
RETURNS TABLE (
 id uuid,
 created_at timestamptz,
 user_id uuid,
 sender_name text,
 sender_role text,
 contact_info text,
 category text,
 content text,
 status text,
 admin_notes text,
 resolved_at timestamptz
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT (public.v4_credentials_ready() AND public.v4_admin()) THEN
   RAISE EXCEPTION 'Chỉ quản trị viên mới có quyền xem hộp thư góp ý.';
 END IF;

 RETURN QUERY
 SELECT f.id, f.created_at, f.user_id, f.sender_name, f.sender_role, f.contact_info,
        f.category, f.content, f.status, f.admin_notes, f.resolved_at
 FROM public.v4_feedback f
 WHERE (p_status IS NULL OR p_status = '' OR f.status = p_status)
 ORDER BY f.created_at DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.v4_get_feedback(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.v4_get_feedback(text) TO authenticated;

-- Function for updating feedback status: ONLY ADMIN
CREATE OR REPLACE FUNCTION public.v4_update_feedback(
 p_id uuid,
 p_status text,
 p_admin_notes text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT (public.v4_credentials_ready() AND public.v4_admin()) THEN
   RAISE EXCEPTION 'Chỉ quản trị viên mới có quyền cập nhật góp ý.';
 END IF;

 IF p_status IS NULL OR p_status NOT IN ('pending','reviewed','resolved') THEN
   RAISE EXCEPTION 'Trạng thái góp ý không hợp lệ.';
 END IF;
 IF length(p_admin_notes)>2000 THEN
   RAISE EXCEPTION 'Ghi chú quản trị tối đa 2000 ký tự.';
 END IF;

 UPDATE public.v4_feedback
 SET status = coalesce(nullif(trim(p_status), ''), status),
     admin_notes = coalesce(p_admin_notes, admin_notes),
     resolved_at = CASE WHEN p_status = 'resolved' THEN coalesce(resolved_at,now()) ELSE NULL END
 WHERE id = p_id;
END;
$$;
REVOKE ALL ON FUNCTION public.v4_update_feedback(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.v4_update_feedback(uuid,text,text) TO authenticated;

CREATE INDEX IF NOT EXISTS v4_feedback_created_at_idx ON public.v4_feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS v4_feedback_status_idx ON public.v4_feedback(status);
CREATE INDEX IF NOT EXISTS v4_feedback_sender_time_idx ON public.v4_feedback(user_id,created_at DESC);

NOTIFY pgrst,'reload schema';
COMMIT;
