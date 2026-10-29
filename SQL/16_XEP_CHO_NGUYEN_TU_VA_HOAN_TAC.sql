-- Sau SQL15/module39. Sao luu va thu rieng truoc; them RPC doi cho/hoan tac, khong doi cho hoc sinh cu.
BEGIN;
DO $guard$
BEGIN
 IF to_regclass('auth.users') IS NULL OR to_regprocedure('auth.uid()') IS NULL OR to_regprocedure('auth.jwt()') IS NULL THEN RAISE EXCEPTION 'Thieu Supabase Auth. Dung dung du an Supabase cua truong.'; END IF;
 IF to_regclass('public.tkb_versions') IS NULL OR to_regclass('public.tkb_entries') IS NULL OR to_regclass('public.tkb_assignments') IS NULL OR to_regprocedure('public.is_tkb_admin()') IS NULL THEN RAISE EXCEPTION 'Thieu schema TKB goc. Khong co du lieu hay schema gia trong bo cai nay.'; END IF;
END $guard$;
DO $guard$
BEGIN
 IF to_regprocedure('public.v4_my_lesson_week(text,date)') IS NULL OR
    to_regprocedure('public.v4_withdraw_observation(uuid,text,timestamptz)') IS NULL OR
    to_regprocedure('public.v4_get_seating_rotation(text,text)') IS NULL THEN
  RAISE EXCEPTION 'Can hoan tat SQL15/module39 truoc SQL16; chay00 va doi chieu buoc con thieu';
 END IF;
END $guard$;
-- Small additive editor API. Existing seating/rotation RPCs keep their contracts.

DO $$ BEGIN
 IF to_regprocedure('public.v4_can_arrange_seats(text,text)') IS NULL THEN
  RAISE EXCEPTION 'Cần cập nhật module34 trước module40';
 END IF;
 IF to_regprocedure('public.v4_get_seating_rotation(text,text)') IS NULL THEN
  RAISE EXCEPTION 'Cần cập nhật module36 trước module40';
 END IF;
END $$;

ALTER TABLE public.v4_layouts ADD COLUMN IF NOT EXISTS seating_revision bigint NOT NULL DEFAULT 0
 CHECK(seating_revision>=0);

-- Seat and active-roster triggers already UPDATE this row; count every such
-- update, including a confirm or rotation edit. now() alone is not a CAS token.
CREATE OR REPLACE FUNCTION public.v4_seating_revision_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP='INSERT' THEN NEW.seating_revision:=0;
 ELSE NEW.seating_revision:=OLD.seating_revision+1; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS v4_seating_revision_guard ON public.v4_layouts;
CREATE TRIGGER v4_seating_revision_guard BEFORE INSERT OR UPDATE ON public.v4_layouts
 FOR EACH ROW EXECUTE FUNCTION public.v4_seating_revision_guard();
REVOKE ALL ON FUNCTION public.v4_seating_revision_guard() FROM PUBLIC,anon,authenticated;

-- A receipt contains at most two affected cells. It is not a new client-write
-- surface or an offline queue; only the guarded RPC below can read/write it.
CREATE TABLE IF NOT EXISTS public.v4_seating_actions (
 actor_id uuid NOT NULL REFERENCES auth.users(id),
 action_id uuid NOT NULL,
 school_year text NOT NULL,
 class_code text NOT NULL,
 request jsonb NOT NULL,
 before_cells jsonb NOT NULL,
 applied_revision text NOT NULL,
 changed boolean NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(actor_id,action_id)
);
ALTER TABLE public.v4_seating_actions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.v4_seating_actions FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.v4_get_seating_workspace(y text,c text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 IF NOT coalesce(public.v4_can_arrange_seats(y,c),false) THEN
  RAISE EXCEPTION 'Không có quyền xếp chỗ lớp này';
 END IF;
 -- One statement gives one snapshot for layout, seats and roster.
 SELECT jsonb_build_object(
  'revision',coalesce(l.seating_revision::text,'missing'),
  'desk_counts',coalesce(l.desk_counts,'[4,4,4,4]'::jsonb),
  'is_confirmed',coalesce(l.is_confirmed,false),
  'layout_updated_at',l.updated_at,
  'rotation_config',coalesce(l.rotation_config,'{"enabled":false,"start_date":null,"horizontal":"none","horizontal_groups":[],"vertical":{}}'::jsonb),
  'rotation_revision',coalesce(l.rotation_revision,0),
  'seats',coalesce((SELECT jsonb_agg(jsonb_build_object('group_no',s.group_no,'desk_no',s.desk_no,'seat_no',s.seat_no,'student_id',s.student_id)
     ORDER BY s.group_no,s.desk_no,s.seat_no) FROM public.v4_seats s WHERE s.school_year=y AND s.class_code=c),'[]'::jsonb),
  'students',coalesce((SELECT jsonb_agg(jsonb_build_object('id',s.id,'student_code',s.student_code,'full_name',s.full_name,'gender',s.gender,'active',s.active)
     ORDER BY s.full_name,s.id) FROM public.v4_students s WHERE s.school_year=y AND s.class_code=c),'[]'::jsonb)
 ) INTO result FROM (SELECT 1) one_row LEFT JOIN public.v4_layouts l ON l.school_year=y AND l.class_code=c;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.v4_apply_seating_change(
 y text,c text,p_action_id uuid,p_expected_revision text,p_changes jsonb,p_undo_of uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 layout_row public.v4_layouts%ROWTYPE; receipt public.v4_seating_actions%ROWTYPE;
 previous public.v4_seating_actions%ROWTYPE; requested jsonb; cells jsonb;
 before_cells jsonb; item jsonb; count_cells integer; student uuid;
 group_n integer; desk_n integer; seat_n integer; changed boolean; applied text; result jsonb;
BEGIN
 IF NOT coalesce(public.v4_can_arrange_seats(y,c),false) THEN
  RAISE EXCEPTION 'Chỉ GVCN hoặc quản trị được xếp chỗ';
 END IF;
 IF p_action_id IS NULL OR p_expected_revision IS NULL OR NOT coalesce(public.v4_school_year_valid(y),false)
    OR c IS NULL OR btrim(c)='' THEN RAISE EXCEPTION 'Thiếu thông tin thao tác hoặc phiên bản sơ đồ'; END IF;
 requested:=jsonb_build_object('year',y,'class',c,'revision',p_expected_revision,'changes',p_changes,'undo_of',p_undo_of);
 -- Serializes initial creation too; existing APIs still serialize on layout.
 PERFORM pg_advisory_xact_lock(hashtextextended(y||'|'||c,40));
 SELECT * INTO layout_row FROM public.v4_layouts WHERE school_year=y AND class_code=c FOR UPDATE;
 SELECT * INTO receipt FROM public.v4_seating_actions WHERE actor_id=auth.uid() AND action_id=p_action_id;
 IF FOUND THEN
  IF receipt.request IS DISTINCT FROM requested THEN RAISE EXCEPTION 'Mã thao tác đã được dùng cho nội dung khác'; END IF;
  result:=public.v4_get_seating_workspace(y,c);
  RETURN result||jsonb_build_object('action_id',p_action_id,'applied_revision',receipt.applied_revision,
   'changed',receipt.changed,'replayed',true,'undoable',receipt.changed AND p_undo_of IS NULL AND result->>'revision'=receipt.applied_revision);
 END IF;
 IF layout_row.school_year IS NULL THEN
  IF p_expected_revision<>'missing' THEN RAISE EXCEPTION 'Sơ đồ đã thay đổi. Làm mới rồi chọn lại'; END IF;
  INSERT INTO public.v4_layouts(school_year,class_code) VALUES(y,c) ON CONFLICT DO NOTHING RETURNING * INTO layout_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sơ đồ đã thay đổi. Làm mới rồi chọn lại'; END IF;
 ELSE
  IF layout_row.seating_revision::text<>p_expected_revision THEN RAISE EXCEPTION 'Sơ đồ đã thay đổi. Làm mới rồi chọn lại'; END IF;
 END IF;
 IF p_undo_of IS NOT NULL THEN
  IF p_changes IS NOT NULL THEN RAISE EXCEPTION 'Hoàn tác không được kèm thay đổi khác'; END IF;
  SELECT * INTO previous FROM public.v4_seating_actions
   WHERE actor_id=auth.uid() AND action_id=p_undo_of AND school_year=y AND class_code=c;
  IF NOT FOUND OR NOT previous.changed OR previous.request->>'undo_of' IS NOT NULL
     OR previous.applied_revision<>layout_row.seating_revision::text THEN
   RAISE EXCEPTION 'Sơ đồ đã thay đổi hoặc thao tác này không thể hoàn tác';
  END IF;
  cells:=previous.before_cells;
 ELSE cells:=p_changes;
 END IF;
 IF cells IS NULL OR jsonb_typeof(cells)<>'array' THEN RAISE EXCEPTION 'Danh sách vị trí không hợp lệ'; END IF;
 count_cells:=jsonb_array_length(cells);
 IF count_cells NOT BETWEEN 1 AND 2 THEN RAISE EXCEPTION 'Mỗi thao tác chỉ được thay đổi một hoặc hai vị trí'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(cells) LOOP
  IF jsonb_typeof(item)<>'object' OR NOT item ?& ARRAY['group_no','desk_no','seat_no','student_id']
     OR (SELECT count(*) FROM jsonb_object_keys(item))<>4
     OR jsonb_typeof(item->'group_no')<>'number' OR item->>'group_no' !~ '^[1-9][0-9]?$'
     OR jsonb_typeof(item->'desk_no')<>'number' OR item->>'desk_no' !~ '^[1-9][0-9]?$'
     OR jsonb_typeof(item->'seat_no')<>'number' OR item->>'seat_no' !~ '^[12]$'
     OR (item->'student_id'<>'null'::jsonb AND jsonb_typeof(item->'student_id')<>'string') THEN
   RAISE EXCEPTION 'Thông tin vị trí không hợp lệ';
  END IF;
  group_n:=(item->>'group_no')::integer;desk_n:=(item->>'desk_no')::integer;seat_n:=(item->>'seat_no')::integer;
  IF group_n>jsonb_array_length(layout_row.desk_counts) OR desk_n>(layout_row.desk_counts->>(group_n-1))::integer THEN
   RAISE EXCEPTION 'Vị trí không thuộc sơ đồ lớp';
  END IF;
  BEGIN student:=(item->>'student_id')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'Học sinh không hợp lệ'; END;
  IF student IS NOT NULL THEN
   PERFORM 1 FROM public.v4_students WHERE id=student AND school_year=y AND class_code=c AND active FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Học sinh không còn học trong lớp này'; END IF;
  END IF;
 END LOOP;
 IF (SELECT count(DISTINCT (group_no,desk_no,seat_no)) FROM jsonb_to_recordset(cells) AS x(group_no integer,desk_no integer,seat_no integer))<>count_cells
    OR (SELECT count(student_id)-count(DISTINCT student_id) FROM jsonb_to_recordset(cells) AS x(student_id uuid))>0 THEN
  RAISE EXCEPTION 'Vị trí hoặc học sinh bị lặp';
 END IF;
 IF EXISTS(SELECT 1 FROM public.v4_seats s
   WHERE s.school_year=y AND s.class_code=c
    AND s.student_id IN(SELECT student_id FROM jsonb_to_recordset(cells) AS x(student_id uuid))
    AND NOT EXISTS(SELECT 1 FROM jsonb_to_recordset(cells) AS x(group_no integer,desk_no integer,seat_no integer)
      WHERE (s.group_no,s.desk_no,s.seat_no)=(x.group_no,x.desk_no,x.seat_no))) THEN
  RAISE EXCEPTION 'Học sinh đã có chỗ khác. Cần chuyển cả vị trí nguồn';
 END IF;
 -- Replacing an occupied target must preserve its pupil in the other cell.
 -- Explicit student_id=null is the separate, intentional remove operation.
 IF EXISTS(SELECT 1 FROM jsonb_to_recordset(cells) AS x(group_no integer,desk_no integer,seat_no integer,student_id uuid)
   JOIN public.v4_seats s ON s.school_year=y AND s.class_code=c AND (s.group_no,s.desk_no,s.seat_no)=(x.group_no,x.desk_no,x.seat_no)
   WHERE x.student_id IS NOT NULL AND x.student_id IS DISTINCT FROM s.student_id
    AND NOT EXISTS(SELECT 1 FROM jsonb_to_recordset(cells) AS target(student_id uuid) WHERE target.student_id=s.student_id)) THEN
  RAISE EXCEPTION 'Ghế đích đang có học sinh. Cần đổi cả hai vị trí';
 END IF;
 SELECT jsonb_agg(jsonb_build_object('group_no',x.group_no,'desk_no',x.desk_no,'seat_no',x.seat_no,'student_id',s.student_id)
   ORDER BY x.group_no,x.desk_no,x.seat_no) INTO before_cells
 FROM jsonb_to_recordset(cells) AS x(group_no integer,desk_no integer,seat_no integer)
 LEFT JOIN public.v4_seats s ON s.school_year=y AND s.class_code=c AND (s.group_no,s.desk_no,s.seat_no)=(x.group_no,x.desk_no,x.seat_no);
 changed:=EXISTS(SELECT 1 FROM jsonb_to_recordset(cells) AS x(group_no integer,desk_no integer,seat_no integer,student_id uuid)
   LEFT JOIN public.v4_seats s ON s.school_year=y AND s.class_code=c AND (s.group_no,s.desk_no,s.seat_no)=(x.group_no,x.desk_no,x.seat_no)
   WHERE x.student_id IS DISTINCT FROM s.student_id);
 IF changed THEN
  DELETE FROM public.v4_seats s USING jsonb_to_recordset(cells) AS x(group_no integer,desk_no integer,seat_no integer)
   WHERE s.school_year=y AND s.class_code=c AND (s.group_no,s.desk_no,s.seat_no)=(x.group_no,x.desk_no,x.seat_no);
  INSERT INTO public.v4_seats(school_year,class_code,group_no,desk_no,seat_no,student_id)
   SELECT y,c,x.group_no,x.desk_no,x.seat_no,x.student_id
   FROM jsonb_to_recordset(cells) AS x(group_no integer,desk_no integer,seat_no integer,student_id uuid) WHERE x.student_id IS NOT NULL;
 END IF;
 result:=public.v4_get_seating_workspace(y,c);applied:=result->>'revision';
 INSERT INTO public.v4_seating_actions(actor_id,action_id,school_year,class_code,request,before_cells,applied_revision,changed)
  VALUES(auth.uid(),p_action_id,y,c,requested,before_cells,applied,changed);
 RETURN result||jsonb_build_object('action_id',p_action_id,'applied_revision',applied,'changed',changed,'replayed',false,'undoable',changed AND p_undo_of IS NULL);
END $$;

REVOKE ALL ON FUNCTION public.v4_get_seating_workspace(text,text),public.v4_apply_seating_change(text,text,uuid,text,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.v4_get_seating_workspace(text,text),public.v4_apply_seating_change(text,text,uuid,text,jsonb,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
NOTIFY pgrst,'reload schema';
COMMIT;
