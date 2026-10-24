-- READ ONLY: inspect legacy version metadata before any repair. No pupil records.
-- Run as the database administrator. Does not normalize or merge any identifiers.
WITH versions AS (
 SELECT v.*,regexp_replace(btrim(coalesce(v.school_year,'')),
  '[[:space:]]*[-–—][[:space:]]*','-','g') AS candidate
 FROM public.tkb_versions v
)
SELECT v.id,v.version_name,v.version_no,v.school_year,v.candidate AS canonical_candidate,
 public.v4_school_year_valid(v.school_year) AS canonical,
 v.semester,v.status,v.is_active,v.effective_date,
 (SELECT count(*) FROM versions other WHERE other.id<>v.id
  AND other.candidate=v.candidate AND other.version_no IS NOT DISTINCT FROM v.version_no
  AND other.semester IS NOT DISTINCT FROM v.semester) AS same_candidate_version_count,
 (SELECT count(*) FROM public.v4_sessions s WHERE s.timetable_version_id=v.id::text) AS linked_lesson_count
FROM versions v ORDER BY v.is_active DESC,v.created_at DESC;

-- For other year-keyed tables, use the authenticated admin inventory in the app.
-- Do not call its JWT-protected RPC from SQL Editor without an authenticated context.
