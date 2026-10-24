-- Ordinary observations remain in history; reminders require health or an
-- explicit unusual-situation mark by the teacher. Do not classify old concerns.
BEGIN;
ALTER TABLE public.v4_observations ADD COLUMN IF NOT EXISTS attention_kind text;
ALTER TABLE public.v4_observations DROP CONSTRAINT IF EXISTS v4_attention_kind_valid;
ALTER TABLE public.v4_observations ADD CONSTRAINT v4_attention_kind_valid
 CHECK(attention_kind IS NULL OR (attention_kind='unusual' AND category='concern' AND is_alert));

CREATE OR REPLACE FUNCTION public.v4_open_alerts(y text,c text)
RETURNS SETOF public.v4_observations
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT o.* FROM public.v4_observations o
 WHERE o.school_year=y AND o.class_code=c AND o.is_alert
   AND (o.category='health' OR o.attention_kind='unusual')
   AND coalesce((SELECT a.action FROM public.v4_alert_actions a
       WHERE a.observation_id=o.id ORDER BY a.created_at DESC,a.id DESC LIMIT 1),'monitoring')<>'resolved'
 ORDER BY o.observed_at DESC
$$;
REVOKE ALL ON FUNCTION public.v4_open_alerts(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v4_open_alerts(text,text) TO authenticated;
INSERT INTO public.v4_behaviors(category,behavior_code,sort_order)
 VALUES('concern','Dấu hiệu bất thường',90) ON CONFLICT DO NOTHING;
COMMIT;
