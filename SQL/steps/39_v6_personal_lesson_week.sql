-- Own lesson review scope. Apply after38; no write-policy or historical identity changes.
BEGIN;
DO $guard$ BEGIN
 IF to_regprocedure('public.v4_withdraw_observation(uuid,text,timestamptz)') IS NULL THEN
  RAISE EXCEPTION 'Cần cập nhật thu hồi ghi nhận38 trước báo cáo cá nhân39';
 END IF;
END $guard$;
CREATE OR REPLACE FUNCTION public.v4_my_lesson_week(y text,week_start date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE first_day date; last_day date; server_day date:=public.v4_school_today(); result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.v4_credentials_ready() THEN RAISE EXCEPTION 'Cần đăng nhập và hoàn tất mật khẩu để xem tiết của mình'; END IF;
 IF y IS NULL OR y !~ '^[0-9]{4}-[0-9]{4}$' OR split_part(y,'-',2)::integer<>split_part(y,'-',1)::integer+1 THEN RAISE EXCEPTION 'Năm học không hợp lệ'; END IF;
 IF week_start IS NULL THEN RAISE EXCEPTION 'Chọn tuần cần xem'; END IF;
 first_day:=date_trunc('week',week_start::timestamp)::date;last_day:=first_day+6;
 IF first_day>date_trunc('week',server_day::timestamp)::date THEN RAISE EXCEPTION 'Chỉ xem được tuần hiện tại hoặc các tuần trước'; END IF;
 WITH
 own AS MATERIALIZED(
  SELECT s.* FROM public.v4_sessions s WHERE s.teacher_id=auth.uid() AND s.school_year=y
   AND s.lesson_date BETWEEN first_day AND last_day AND public.v4_actual_class_access(s.school_year,s.class_code)
 ), atts AS MATERIALIZED(
  SELECT a.* FROM public.v4_attendance a JOIN own s ON s.id=a.session_id
 ), obs AS MATERIALIZED(
  SELECT o.* FROM public.v4_observations o JOIN own s ON s.id=o.session_id
   WHERE o.created_by=auth.uid() AND o.withdrawn_at IS NULL
 ), refs AS MATERIALIZED(
  SELECT student_id FROM atts UNION SELECT student_id FROM obs
 ), active_version AS MATERIALIZED(
  SELECT v.* FROM public.tkb_versions v WHERE v.is_active AND v.status='published' AND v.school_year=y
 ), teacher AS MATERIALIZED(
  SELECT t.teacher_code FROM public.v4_teachers t WHERE t.user_id=auth.uid()
 ), planned AS MATERIALIZED(
  SELECT d::date AS lesson_date,e.period_no,e.class_code,e.subject,e.version_id
  FROM generate_series(first_day::timestamp,last_day::timestamp,interval '1 day') d
   JOIN active_version v ON first_day=date_trunc('week',server_day::timestamp)::date
    AND d::date>=server_day AND v.effective_date<=d::date
   JOIN public.tkb_entries e ON e.version_id=v.id AND e.day_no=extract(isodow FROM d)::integer+1
   JOIN teacher t ON t.teacher_code=e.teacher_code
  WHERE (SELECT count(*) FROM active_version)=1 AND coalesce(e.status,'Học')='Học'
   AND public.v4_actual_class_access(y,e.class_code)
   AND NOT EXISTS(SELECT 1 FROM own s WHERE s.lesson_date=d::date AND s.period_no=e.period_no AND s.class_code=e.class_code)
 )
 SELECT jsonb_build_object('school_year',y,'week_start',first_day,'week_end',last_day,'server_today',server_day,'scope','own_lessons',
  'sessions',coalesce((SELECT jsonb_agg(to_jsonb(s)||jsonb_build_object(
    'can_write',public.v4_check_lesson_writable(s.id),
    'is_auto_ended',s.ended_at IS NULL AND coalesce(s.scheduled_end_at<=statement_timestamp(),false),
    'source_missing',s.timetable_version_id IS NULL OR v.id IS NULL,
    'version',CASE WHEN v.id IS NULL THEN NULL ELSE jsonb_build_object('id',v.id,'number',v.version_no,'name',v.version_name,'effective_date',v.effective_date) END,
    'review',(SELECT to_jsonb(r) FROM public.v4_lesson_reviews r WHERE r.session_id=s.id),
    'attendance_count',(SELECT count(*) FROM atts a WHERE a.session_id=s.id),
    'roster_count',jsonb_array_length(coalesce(public.v4_attendance_state(s.id)->'roster_ids','[]'::jsonb)),
    'ppct_status','not_linked') ORDER BY s.lesson_date,s.period_no,s.class_code)
   FROM own s LEFT JOIN public.tkb_versions v ON v.id::text=s.timetable_version_id),'[]'::jsonb),
  'attendance',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.session_id,a.student_id) FROM atts a),'[]'::jsonb),
  'observations',coalesce((SELECT jsonb_agg(to_jsonb(o) ORDER BY o.observed_at,o.id) FROM obs o),'[]'::jsonb),
  'students',coalesce((SELECT jsonb_agg(jsonb_build_object('id',st.id,'student_code',st.student_code,'full_name',st.full_name,'class_code',st.class_code) ORDER BY st.student_code,st.id) FROM public.v4_students st JOIN refs r ON r.student_id=st.id),'[]'::jsonb),
  'scheduled',coalesce((SELECT jsonb_agg(to_jsonb(p)||jsonb_build_object('source','active_timetable','ppct_status','not_linked') ORDER BY p.lesson_date,p.period_no,p.class_code) FROM planned p),'[]'::jsonb),
  'schedule_notice',CASE WHEN first_day<date_trunc('week',server_day::timestamp)::date THEN 'Tuần cũ chỉ hiển thị tiết đã ghi. Chưa đủ nguồn để khôi phục các ô TKB chưa mở.' ELSE 'Ô chưa mở chỉ theo TKB đang áp dụng từ hôm nay. Các ngày trước chỉ hiển thị tiết đã ghi.' END,
  'ppct_notice','Chưa có liên kết bài/tiết PPCT được lưu với từng tiết; không suy bài đã dạy từ lịch kế hoạch.') INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.v4_my_lesson_week(text,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.v4_my_lesson_week(text,date) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
