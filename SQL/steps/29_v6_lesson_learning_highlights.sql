-- Add grouped learning highlights to the existing read-only lesson handoff.
-- Apply after28. No table/data/write-policy changes; no health/support or free-text pupil notes.
BEGIN;
DO $guard$ BEGIN
 IF to_regprocedure('public.v4_activate_timetable(uuid,timestamptz,text)') IS NULL OR
    to_regprocedure('public.v4_lesson_handoffs(text,text,date,date,text)') IS NULL THEN
  RAISE EXCEPTION 'Cần hoàn tất cập nhật28 trước khi thêm thông tin các tiết trước';
 END IF;
END $guard$;
CREATE OR REPLACE FUNCTION public.v4_lesson_handoffs(
 y text,c text,d1 date,d2 date,range_kind text DEFAULT 'week') RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE cls text:=nullif(btrim(c),''); admin_access boolean; home_access boolean; result jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Cần đăng nhập để xem tổng hợp tiết học'; END IF;
 IF NOT public.v4_credentials_ready() THEN RAISE EXCEPTION 'Cần đổi mật khẩu trước khi xem dữ liệu lớp'; END IF;
 IF y IS NULL OR y !~ '^[0-9]{4}-[0-9]{4}$' OR split_part(y,'-',2)::integer<>split_part(y,'-',1)::integer+1 THEN RAISE EXCEPTION 'Năm học không hợp lệ'; END IF;
 IF cls IS NULL THEN RAISE EXCEPTION 'Chọn một lớp để xem tổng hợp tiết học'; END IF;
 IF d1 IS NULL OR d2 IS NULL OR d2<d1 OR d2-d1>369 THEN RAISE EXCEPTION 'Khoảng báo cáo phải từ 1 đến 370 ngày'; END IF;
 IF range_kind IS NULL OR range_kind NOT IN('week','month','semester','custom') THEN RAISE EXCEPTION 'Loại báo cáo không hợp lệ'; END IF;
 admin_access:=public.v4_admin();home_access:=public.v4_actual_homeroom(y,cls);
 IF NOT admin_access AND NOT public.v4_actual_class_access(y,cls) THEN RAISE EXCEPTION 'Không có quyền xem dữ liệu lớp này'; END IF;
 IF NOT admin_access AND NOT home_access AND range_kind<>'week' THEN RAISE EXCEPTION 'Giáo viên bộ môn chỉ xem đánh giá theo tuần'; END IF;
 IF range_kind='week' AND (d2-d1>6 OR date_trunc('week',d1::timestamp)<>date_trunc('week',d2::timestamp)) THEN RAISE EXCEPTION 'Chọn các ngày trong cùng một tuần';
 ELSIF range_kind='month' AND date_trunc('month',d1::timestamp)<>date_trunc('month',d2::timestamp) THEN RAISE EXCEPTION 'Chọn các ngày trong cùng một tháng';
 ELSIF range_kind='semester' AND d2-d1>219 THEN RAISE EXCEPTION 'Khoảng học kỳ tối đa 220 ngày';
 ELSIF range_kind='custom' AND NOT admin_access THEN RAISE EXCEPTION 'Khoảng tùy chọn chỉ dành cho quản trị'; END IF;
 IF NOT admin_access AND NOT home_access AND d2>date_trunc('week',public.v4_school_today()::timestamp)::date+6 THEN RAISE EXCEPTION 'Chỉ xem được tuần hiện tại hoặc các tuần trước'; END IF;
 WITH lessons AS MATERIALIZED(
  SELECT s.id,s.school_year,s.class_code,s.lesson_date,s.period_no,s.subject,s.teacher_id,t.teacher_name,s.scheduled_end_at,s.ended_at
  FROM public.v4_sessions s LEFT JOIN public.v4_teachers t ON t.user_id=s.teacher_id
  WHERE s.school_year=y AND s.class_code=cls AND s.lesson_date BETWEEN d1 AND d2
 ), attendance AS(
  SELECT a.session_id,count(*) AS confirmed,count(*) FILTER(WHERE a.status='present') AS present,
   count(*) FILTER(WHERE a.status='absent') AS absent,count(*) FILTER(WHERE a.status='late') AS late,
   count(*) FILTER(WHERE a.status='excused') AS excused,max(a.updated_at) AS updated_at
  FROM public.v4_attendance a JOIN lessons l ON l.id=a.session_id GROUP BY a.session_id
 ), observations AS(
  -- Learning handoff never includes health or support facts, even for viewers
  -- whose separate health RLS permits reading those records.
  SELECT o.session_id,count(*) FILTER(WHERE o.category='positive') AS positive,
   count(*) FILTER(WHERE o.category='concern') AS concern,max(coalesce(o.edited_at,o.observed_at)) AS updated_at
  FROM public.v4_observations o JOIN lessons l ON l.id=o.session_id
  WHERE o.category IN('positive','concern') GROUP BY o.session_id
 ), learning_members AS (
  SELECT DISTINCT o.session_id,o.category,btrim(o.behavior_code) AS behavior_code,
   st.id AS student_id,st.full_name,st.student_code
  FROM public.v4_observations o JOIN lessons l ON l.id=o.session_id
   JOIN public.v4_students st ON st.id=o.student_id AND st.school_year=y AND st.class_code=cls
  WHERE o.school_year=y AND o.class_code=cls AND o.category IN('positive','concern')
 ), learning_groups AS (
  SELECT session_id,category,behavior_code,
   jsonb_agg(jsonb_build_object('student_id',student_id,'full_name',full_name,'student_code',student_code)
    ORDER BY full_name,student_code,student_id) AS students
  FROM learning_members GROUP BY session_id,category,behavior_code
 ), learning_highlights AS (
  SELECT session_id,jsonb_agg(jsonb_build_object('category',category,'behavior_code',behavior_code,'students',students)
   ORDER BY CASE category WHEN 'concern' THEN 0 ELSE 1 END,behavior_code) AS groups
  FROM learning_groups GROUP BY session_id
 ), facts AS(
  SELECT l.*,coalesce(a.confirmed,0) AS confirmed,coalesce(a.present,0) AS present,
   coalesce(a.absent,0) AS absent,coalesce(a.late,0) AS late,coalesce(a.excused,0) AS excused,
   coalesce(o.positive,0) AS positive,coalesce(o.concern,0) AS concern,
   greatest(a.updated_at,o.updated_at) AS facts_updated_at,r.id AS review_id,r.note AS teacher_note,r.confirmed_at,coalesce(h.groups,'[]'::jsonb) AS learning_groups
  FROM lessons l LEFT JOIN attendance a ON a.session_id=l.id LEFT JOIN observations o ON o.session_id=l.id
   LEFT JOIN public.v4_lesson_reviews r ON r.session_id=l.id
   LEFT JOIN learning_highlights h ON h.session_id=l.id
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',f.id,'session_id',f.id,'school_year',f.school_year,'class_code',f.class_code,'lesson_date',f.lesson_date,
  'period_no',f.period_no,'subject',f.subject,'teacher_id',f.teacher_id,'teacher_name',f.teacher_name,
  'source',CASE WHEN f.review_id IS NOT NULL THEN 'teacher' ELSE 'system' END,
  'source_label',CASE WHEN f.review_id IS NOT NULL THEN 'Giáo viên đã xác nhận' ELSE 'Tổng hợp hệ thống' END,
  'stage',CASE WHEN f.ended_at IS NOT NULL OR f.scheduled_end_at<=statement_timestamp() THEN 'final' WHEN f.scheduled_end_at IS NULL THEN 'unknown' ELSE 'in_progress' END,
  'scheduled_end_at',f.scheduled_end_at,'confirmed_at',f.confirmed_at,'generated_at',statement_timestamp(),
  'facts_updated_at',f.facts_updated_at,'review_id',f.review_id,'learning_groups',f.learning_groups,
  'attendance_confirmed',f.confirmed,'present',f.present,'absent',f.absent,'late',f.late,'excused',f.excused,
  'positive',f.positive,'concern',f.concern,'unrecorded',NULL,'attendance_completeness','recorded_only',
  'note',CASE WHEN f.review_id IS NOT NULL THEN f.teacher_note
   WHEN f.confirmed=0 AND f.positive=0 AND f.concern=0 THEN 'Chưa có dữ liệu điểm danh hoặc nhận xét học sinh được lưu cho tiết này.'
   ELSE concat('Điểm danh đã xác nhận: ',f.confirmed,' lượt; có mặt: ',f.present,'; vắng: ',f.absent,'; muộn: ',f.late,'; có phép: ',f.excused,
    '. Nhận xét đã lưu: ',f.positive,' lượt tích cực, ',f.concern,' lượt cần cải thiện. Chưa xác nhận điểm danh không được suy thành có mặt hoặc vắng.') END
 ) ORDER BY f.lesson_date,f.period_no,f.id),'[]'::jsonb) INTO result FROM facts f;
 RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.v4_lesson_handoffs(text,text,date,date,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.v4_lesson_handoffs(text,text,date,date,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
