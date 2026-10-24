-- CHI CAI LAN DAU module moi tren CSDL TKB da co. SAO LUU truoc khi chay.
BEGIN;
DO $guard$
BEGIN
 IF to_regclass('auth.users') IS NULL OR to_regprocedure('auth.uid()') IS NULL OR to_regprocedure('auth.jwt()') IS NULL THEN RAISE EXCEPTION 'Thieu Supabase Auth. Dung dung du an Supabase cua truong.'; END IF;
 IF to_regclass('public.tkb_versions') IS NULL OR to_regclass('public.tkb_entries') IS NULL OR to_regclass('public.tkb_assignments') IS NULL OR to_regprocedure('public.is_tkb_admin()') IS NULL THEN RAISE EXCEPTION 'Thieu schema TKB goc. Khong co du lieu hay schema gia trong bo cai nay.'; END IF;
END $guard$;
DO $guard$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND starts_with(c.relname,'v4_')) THEN RAISE EXCEPTION 'Module v4 da ton tai. Khong chay lai bo cai01. Chay00 va chi ap dung buoc con thieu.'; END IF;
END $guard$;

-- SOURCE 01_v4_new_module.sql
-- V4 bổ sung. KHÔNG DROP/ALTER bất kỳ bảng TKB nào.
-- Chạy trong SQL Editor Supabase sau khi sao lưu; xem docs/TRIEN_KHAI.md.

create extension if not exists pgcrypto;
create table if not exists public.v4_teachers (
 user_id uuid primary key references auth.users(id) on delete cascade,
 teacher_code text not null unique,
 teacher_name text not null,
 created_at timestamptz default now()
);
create table if not exists public.v4_class_access (
 user_id uuid not null references auth.users(id) on delete cascade,
 school_year text not null, class_code text not null,
 role text not null check(role in ('gvbm','gvcn')),
 primary key(user_id,school_year,class_code,role)
);
create unique index if not exists v4_one_homeroom_per_class
 on public.v4_class_access(school_year,class_code) where role='gvcn';
create table if not exists public.v4_students (
 id uuid primary key default gen_random_uuid(),
 school_year text not null, class_code text not null,
 student_code text not null,
 full_name text not null,
 gender text not null check(gender in ('Nam','Nữ','Khác','Chưa rõ')),
 birth_date date, active boolean not null default true,
 created_at timestamptz not null default now(),
 unique(school_year,student_code), unique(id,school_year,class_code)
);
create table if not exists public.v4_layouts (
 school_year text not null, class_code text not null,
 desk_counts jsonb not null default '[4,4,4,4]'::jsonb,
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id),
 primary key(school_year,class_code),
 constraint valid_desk_counts check (jsonb_typeof(desk_counts)='array' and jsonb_array_length(desk_counts)=4)
);
create or replace function public.v4_valid_desks(j jsonb) returns boolean
 language plpgsql immutable as $$
 declare v text;
 begin
  if j is null or jsonb_typeof(j)<>'array' or jsonb_array_length(j)<>4 then return false; end if;
  for v in select jsonb_array_elements_text(j) loop
   if v !~ '^[0-9]{1,2}$' or v::int not between 1 and 20 then return false; end if;
  end loop;
  return true;
 end $$;
alter table public.v4_layouts add constraint v4_desk_count_ranges
 check(public.v4_valid_desks(desk_counts));
create table if not exists public.v4_seats (
 school_year text not null, class_code text not null,
 group_no integer not null check(group_no between 1 and 4),
 desk_no integer not null check(desk_no between 1 and 20),
 seat_no integer not null check(seat_no in (1,2)),
 student_id uuid not null,
 primary key(school_year,class_code,group_no,desk_no,seat_no),
 unique(school_year,class_code,student_id),
 foreign key(student_id,school_year,class_code) references public.v4_students(id,school_year,class_code)
);
create table if not exists public.v4_lesson_times (
 period_no integer primary key check(period_no between 1 and 12),
 start_time time not null, end_time time not null,
 check(start_time < end_time)
);
insert into public.v4_lesson_times(period_no,start_time,end_time)
 values (1,'07:15','08:00'),(2,'08:05','08:50'),(3,'09:00','09:45'),(4,'09:50','10:35'),(5,'10:40','11:25')
 on conflict do nothing;
create table if not exists public.v4_sessions (
 id uuid primary key default gen_random_uuid(),
 school_year text not null, class_code text not null,
 lesson_date date not null,
 period_no integer not null check(period_no between 1 and 12),
 subject text not null,
 timetable_version_id text,
 override_reason text not null default '',
 teacher_id uuid not null default auth.uid() references auth.users(id),
 source text not null default 'tkb' check(source in ('tkb','day_thay','thu_cong')),
 ended_at timestamptz,
 created_at timestamptz not null default now(),
 unique(school_year,class_code,lesson_date,period_no)
);
create table if not exists public.v4_attendance (
 session_id uuid not null references public.v4_sessions(id) on delete cascade,
 student_id uuid not null references public.v4_students(id),
 status text not null check(status in ('present','absent','late','excused')),
 note text not null default '',
 updated_by uuid not null default auth.uid() references auth.users(id),
 updated_at timestamptz not null default now(),
 primary key(session_id,student_id)
);
create table if not exists public.v4_observations (
 id uuid primary key default gen_random_uuid(),
 student_id uuid not null references public.v4_students(id),
 school_year text not null, class_code text not null,
 session_id uuid references public.v4_sessions(id),
 observed_at timestamptz not null default now(),
 category text not null check(category in ('positive','concern','health')),
 behavior_code text not null,
 activity_context text not null default '',
 note text not null default '',
 is_alert boolean not null default false,
 created_by uuid not null default auth.uid() references auth.users(id),
 edited_at timestamptz,
 created_at timestamptz not null default now()
);
create table if not exists public.v4_alert_actions (
 id uuid primary key default gen_random_uuid(),
 observation_id uuid not null references public.v4_observations(id),
 action text not null check(action in ('monitoring','resolved')),
 note text not null default '',
 acted_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now()
);
create table if not exists public.v4_audit (
 id bigint generated always as identity primary key,
 table_name text not null,
 row_id text not null,
 old_row jsonb,
 changed_by uuid,
 changed_at timestamptz default now()
);
create or replace function public.v4_admin() returns boolean
 language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and coalesce(public.is_tkb_admin(),false)
 $$;
create or replace function public.v4_has_class(y text,c text) returns boolean
 language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and (public.v4_admin() or exists(
  select 1 from public.v4_class_access ca where ca.user_id=auth.uid() and ca.school_year=y and ca.class_code=c))
 $$;
create or replace function public.v4_shared_teacher(uid uuid) returns boolean
 language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and exists(
  select 1 from public.v4_class_access a join public.v4_class_access b
   on a.school_year=b.school_year and a.class_code=b.class_code
  where a.user_id=auth.uid() and b.user_id=uid)
 $$;
create or replace function public.v4_homeroom(y text,c text) returns boolean
 language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and (public.v4_admin() or exists(
  select 1 from public.v4_class_access ca where ca.user_id=auth.uid() and ca.school_year=y and ca.class_code=c and ca.role='gvcn'))
 $$;
-- Sức khỏe: quản trị không tự động đọc được; cần là giáo viên được phân công vào lớp.
create or replace function public.v4_health_access(y text,c text) returns boolean
 language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and exists(
  select 1 from public.v4_class_access ca where ca.user_id=auth.uid() and ca.school_year=y and ca.class_code=c)
 $$;
create or replace function public.v4_observation_access(ob uuid) returns boolean
 language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.v4_observations o where o.id=ob and
  ((o.category='health' and public.v4_health_access(o.school_year,o.class_code))
   or (o.category<>'health' and public.v4_has_class(o.school_year,o.class_code))))
 $$;
-- Chỉ người đang dạy hoặc GVCN được tác động tình trạng cảnh báo của lớp.
-- Quyền xem tổng hợp của Admin không trao quyền tự ý xử lý cảnh báo.
create or replace function public.v4_can_manage_alert(ob uuid) returns boolean
 language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and exists(
  select 1 from public.v4_observations o
  where o.id=ob and o.is_alert=true
   and public.v4_health_access(o.school_year,o.class_code))
 $$;
create or replace function public.v4_session_owner(s uuid) returns boolean
 language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.v4_sessions x where x.id=s and x.teacher_id=auth.uid())
 $$;
create or replace function public.v4_session_class(s uuid,y text,c text) returns boolean
 language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.v4_sessions x where x.id=s and x.school_year=y and x.class_code=c)
 $$;
create or replace function public.v4_student_class(st uuid,y text,c text) returns boolean
 language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.v4_students x where x.id=st and x.school_year=y and x.class_code=c and x.active)
 $$;
-- Bất biến an ninh: quan sát và điểm danh phải trỏ đúng học sinh của lớp tiết học.
create or replace function public.v4_validate_observation() returns trigger language plpgsql set search_path=public as $$
begin
 if not public.v4_student_class(new.student_id,new.school_year,new.class_code) then raise exception 'Học sinh không thuộc lớp';end if;
 if new.session_id is not null and not public.v4_session_class(new.session_id,new.school_year,new.class_code) then raise exception 'Tiết không thuộc lớp';end if;
 return new;
end $$;
create trigger v4_check_obs before insert or update on public.v4_observations for each row execute function public.v4_validate_observation();
create or replace function public.v4_validate_attendance() returns trigger language plpgsql set search_path=public as $$
declare sess record;
begin
 select school_year,class_code into sess from public.v4_sessions where id=new.session_id;
 if not found or not public.v4_student_class(new.student_id,sess.school_year,sess.class_code) then raise exception 'Học sinh không thuộc tiết học';end if;
 return new;
end $$;
create trigger v4_check_att before insert or update on public.v4_attendance for each row execute function public.v4_validate_attendance();
create or replace function public.v4_audit_update() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.v4_audit(table_name,row_id,old_row,changed_by) values(TG_TABLE_NAME,
  coalesce(to_jsonb(old)->>'id',to_jsonb(old)->>'session_id','?'),to_jsonb(old),auth.uid());
 return new;
end $$;
create trigger v4_audit_obs before update on public.v4_observations for each row execute function public.v4_audit_update();
create trigger v4_audit_att before update on public.v4_attendance for each row execute function public.v4_audit_update();
create trigger v4_audit_students before update on public.v4_students for each row execute function public.v4_audit_update();
-- Bảo vệ chính các cột định danh/quyền tác giả khỏi bị sửa bởi frontend.
create or replace function public.v4_lock_observation_identity() returns trigger language plpgsql as $$
begin
 if row(old.id,old.student_id,old.school_year,old.class_code,old.session_id,old.created_by,old.created_at)
  is distinct from row(new.id,new.student_id,new.school_year,new.class_code,new.session_id,new.created_by,new.created_at)
  then raise exception 'Không thể sửa thông tin định danh';end if;
 new.edited_at=now();return new;
end $$;
create trigger v4_lock_obs before update on public.v4_observations for each row execute function public.v4_lock_observation_identity();
create or replace function public.v4_lock_att_identity() returns trigger language plpgsql as $$
begin
 if row(old.session_id,old.student_id) is distinct from row(new.session_id,new.student_id) then raise exception 'Không thể sửa định danh điểm danh';end if;
 new.updated_at=now();return new;
end $$;
create trigger v4_lock_att before update on public.v4_attendance for each row execute function public.v4_lock_att_identity();
-- RLS và quyền chuẩn; không dùng service_role ở client.
alter table public.v4_teachers enable row level security;
alter table public.v4_class_access enable row level security;
alter table public.v4_students enable row level security;
alter table public.v4_layouts enable row level security;
alter table public.v4_seats enable row level security;
alter table public.v4_lesson_times enable row level security;
alter table public.v4_sessions enable row level security;
alter table public.v4_attendance enable row level security;
alter table public.v4_observations enable row level security;
alter table public.v4_alert_actions enable row level security;
alter table public.v4_audit enable row level security;
create policy v4_teacher_view on public.v4_teachers for select to authenticated using(user_id=auth.uid() or public.v4_admin() or public.v4_shared_teacher(user_id));
create policy v4_teacher_manage on public.v4_teachers for all to authenticated using(public.v4_admin()) with check(public.v4_admin());
create policy v4_access_view on public.v4_class_access for select to authenticated using(user_id=auth.uid() or public.v4_admin());
create policy v4_access_manage on public.v4_class_access for all to authenticated using(public.v4_admin()) with check(public.v4_admin());
create policy v4_students_view on public.v4_students for select to authenticated using(public.v4_has_class(school_year,class_code));
create policy v4_students_add on public.v4_students for insert to authenticated with check(public.v4_homeroom(school_year,class_code));
create policy v4_students_edit on public.v4_students for update to authenticated using(public.v4_homeroom(school_year,class_code)) with check(public.v4_homeroom(school_year,class_code));
create policy v4_layout_view on public.v4_layouts for select to authenticated using(public.v4_has_class(school_year,class_code));
create policy v4_layout_manage on public.v4_layouts for insert to authenticated with check(public.v4_homeroom(school_year,class_code));
create policy v4_layout_edit on public.v4_layouts for update to authenticated using(public.v4_homeroom(school_year,class_code)) with check(public.v4_homeroom(school_year,class_code));
create policy v4_seat_view on public.v4_seats for select to authenticated using(public.v4_has_class(school_year,class_code));
create policy v4_seat_add on public.v4_seats for insert to authenticated with check(public.v4_homeroom(school_year,class_code));
create policy v4_seat_edit on public.v4_seats for update to authenticated using(public.v4_homeroom(school_year,class_code)) with check(public.v4_homeroom(school_year,class_code));
create policy v4_seat_delete on public.v4_seats for delete to authenticated using(public.v4_homeroom(school_year,class_code));
create policy v4_times_read on public.v4_lesson_times for select to authenticated using(true);
create policy v4_times_admin on public.v4_lesson_times for all to authenticated using(public.v4_admin()) with check(public.v4_admin());
create policy v4_session_read on public.v4_sessions for select to authenticated using(public.v4_has_class(school_year,class_code));
create policy v4_session_create on public.v4_sessions for insert to authenticated with check(teacher_id=auth.uid() and public.v4_has_class(school_year,class_code));
create policy v4_session_edit on public.v4_sessions for update to authenticated using(teacher_id=auth.uid()) with check(teacher_id=auth.uid());
create policy v4_att_read on public.v4_attendance for select to authenticated using(
 exists(select 1 from public.v4_sessions x where x.id=session_id and public.v4_has_class(x.school_year,x.class_code)));
create policy v4_att_add on public.v4_attendance for insert to authenticated with check(public.v4_session_owner(session_id) and updated_by=auth.uid());
create policy v4_att_edit on public.v4_attendance for update to authenticated using(public.v4_session_owner(session_id)) with check(public.v4_session_owner(session_id) and updated_by=auth.uid());
create policy v4_obs_read on public.v4_observations for select to authenticated using(
 (category='health' and public.v4_health_access(school_year,class_code)) or
 (category<>'health' and public.v4_has_class(school_year,class_code)));
create policy v4_obs_add on public.v4_observations for insert to authenticated with check(
 created_by=auth.uid() and public.v4_has_class(school_year,class_code) and
 (category<>'health' or public.v4_health_access(school_year,class_code)));
create policy v4_obs_edit on public.v4_observations for update to authenticated
 using(created_by=auth.uid() and public.v4_has_class(school_year,class_code) and
 (category<>'health' or public.v4_health_access(school_year,class_code)))
 with check(created_by=auth.uid() and public.v4_has_class(school_year,class_code) and
 (category<>'health' or public.v4_health_access(school_year,class_code)));
create policy v4_action_read on public.v4_alert_actions for select to authenticated using(public.v4_observation_access(observation_id));
create policy v4_action_insert on public.v4_alert_actions for insert to authenticated with check(acted_by=auth.uid() and public.v4_can_manage_alert(observation_id));
create policy v4_audit_read on public.v4_audit for select to authenticated using(public.v4_admin());
revoke all on public.v4_audit from anon,authenticated;
-- audit không thể bị xem trực tiếp qua frontend; xem bằng SQL Editor khi cần.
grant select,insert,update,delete on public.v4_teachers,public.v4_class_access,public.v4_students,public.v4_layouts,public.v4_seats,public.v4_lesson_times,public.v4_sessions,public.v4_attendance,public.v4_observations,public.v4_alert_actions to authenticated;
grant usage on schema public to authenticated;
-- SECURITY DEFINER helpers must not inherit default EXECUTE to PUBLIC/anonymous users.
revoke all on function public.v4_admin(),public.v4_shared_teacher(uuid),public.v4_has_class(text,text),public.v4_homeroom(text,text),public.v4_health_access(text,text),public.v4_observation_access(uuid),public.v4_can_manage_alert(uuid),public.v4_session_owner(uuid),public.v4_session_class(uuid,text,text),public.v4_student_class(uuid,text,text) from public;
grant execute on function public.v4_admin(),public.v4_shared_teacher(uuid),public.v4_has_class(text,text),public.v4_homeroom(text,text),public.v4_health_access(text,text),public.v4_observation_access(uuid),public.v4_can_manage_alert(uuid),public.v4_session_owner(uuid),public.v4_session_class(uuid,text,text),public.v4_student_class(uuid,text,text) to authenticated;
-- Các RPC phụ trợ: thao tác GVCN nguyên tử; quản trị gắn tài khoản GV theo email đã đăng ký.
create or replace function public.v4_assign_seat(y text,c text,g integer,d integer,s integer,st uuid)
returns void language plpgsql security definer set search_path=public as $$
declare n integer;
begin
 if not public.v4_homeroom(y,c) then raise exception 'Không có quyền xếp chỗ';end if;
 select (desk_counts->>(g-1))::integer into n from public.v4_layouts where school_year=y and class_code=c;
 if g not between 1 and 4 or d<1 or d>coalesce(n,0) or s not in (1,2) then raise exception 'Vị trí không hợp lệ';end if;
 if st is not null and not public.v4_student_class(st,y,c) then raise exception 'Học sinh không thuộc lớp';end if;
 if st is not null then delete from public.v4_seats where school_year=y and class_code=c and student_id=st;end if;
 delete from public.v4_seats where school_year=y and class_code=c and group_no=g and desk_no=d and seat_no=s;
 if st is not null then insert into public.v4_seats(school_year,class_code,group_no,desk_no,seat_no,student_id) values(y,c,g,d,s,st);end if;
end $$;
create or replace function public.v4_set_desks(y text,c text,g integer,n integer)
returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.v4_homeroom(y,c) then raise exception 'Không có quyền';end if;
 if g not between 1 and 4 or n not between 1 and 20 then raise exception 'Số bàn phải từ 1 đến 20';end if;
 insert into public.v4_layouts(school_year,class_code,updated_by)
 values(y,c,auth.uid()) on conflict(school_year,class_code) do nothing;
 update public.v4_layouts set desk_counts=jsonb_set(desk_counts,ARRAY[(g-1)::text],to_jsonb(n)),updated_at=now(),updated_by=auth.uid()
 where school_year=y and class_code=c;
 delete from public.v4_seats where school_year=y and class_code=c and group_no=g and desk_no>n;
end $$;
create or replace function public.v4_admin_bind_teacher(em text, code text, fullname text, year text, cls text, job text)
returns text language plpgsql security definer set search_path=public as $$
declare uid uuid;
begin
 if not public.v4_admin() then raise exception 'Chỉ quản trị được cấp quyền';end if;
 if job not in ('gvbm','gvcn') or length(trim(code))=0 or length(trim(cls))=0 then raise exception 'Thông tin chưa hợp lệ';end if;
 select id into uid from auth.users where lower(email)=lower(trim(em)) limit 1;
 if uid is null then raise exception 'Email chưa có tài khoản Supabase Auth';end if;
 insert into public.v4_teachers(user_id,teacher_code,teacher_name) values(uid,trim(code),trim(fullname))
 on conflict(user_id) do update set teacher_code=excluded.teacher_code,teacher_name=excluded.teacher_name;
 insert into public.v4_class_access(user_id,school_year,class_code,role) values(uid,trim(year),trim(cls),job)
 on conflict do nothing;
 return uid::text;
end $$;
revoke all on function public.v4_assign_seat(text,text,integer,integer,integer,uuid),
 public.v4_set_desks(text,text,integer,integer), public.v4_admin_bind_teacher(text,text,text,text,text,text) from public;
grant execute on function public.v4_assign_seat(text,text,integer,integer,integer,uuid),
 public.v4_set_desks(text,text,integer,integer), public.v4_admin_bind_teacher(text,text,text,text,text,text) to authenticated;
create or replace function public.v4_lock_session_identity() returns trigger language plpgsql as $$
begin
 if row(old.id,old.school_year,old.class_code,old.lesson_date,old.period_no,old.teacher_id,old.created_at)
  is distinct from row(new.id,new.school_year,new.class_code,new.lesson_date,new.period_no,new.teacher_id,new.created_at) then
   raise exception 'Không được sửa lớp/tiết/người tạo';end if;
 return new;
end $$;
create trigger v4_lock_session before update on public.v4_sessions for each row execute function public.v4_lock_session_identity();

-- V5: Ràng buộc xác thực tiết dạy và giới hạn biến đổi, không đụng bảng TKB.
-- Bắt buộc có RPC is_tkb_admin() từ hệ thống TKB hiện tại.
create or replace function public.v4_verify_session() returns trigger
language plpgsql security definer set search_path=public as $$
declare tcode text;
begin
 if new.source='tkb' then
  if new.timetable_version_id is null then raise exception 'Chưa xác định bản thời khóa biểu'; end if;
  select teacher_code into tcode from public.v4_teachers where user_id=new.teacher_id;
  if tcode is null or not exists (
   select 1 from public.tkb_entries e join public.tkb_versions v on v.id=e.version_id
   where e.version_id::text=new.timetable_version_id and v.status='published' and v.is_active=true
     and e.teacher_code=tcode and e.class_code=new.class_code
     and e.period_no=new.period_no and e.day_no=extract(isodow from new.lesson_date)::integer+1
     and e.subject=new.subject
  ) then raise exception 'Tiết này không khớp TKB của giáo viên. Chọn chế độ dạy thay/thủ công và ghi lý do.'; end if;
 else
  if length(trim(new.override_reason)) < 10 then
   raise exception 'Cần ghi lý do ít nhất 10 ký tự khi dạy thay/chọn thủ công';
  end if;
 end if;
 return new;
end $$;
create trigger v4_verify_session_insert before insert on public.v4_sessions
 for each row execute function public.v4_verify_session();

-- Chặn đổi lớp/năm học/mã HS của dữ liệu đã được ghi nhận.
create or replace function public.v4_lock_student_identity() returns trigger
language plpgsql as $$
begin
 if row(old.id,old.school_year,old.class_code,old.student_code)
    is distinct from row(new.id,new.school_year,new.class_code,new.student_code) then
  raise exception 'Không được thay mã hoặc lớp học sinh đã có hồ sơ; dùng quy trình chuyển lớp';
 end if;
 return new;
end $$;
create trigger v4_lock_student before update on public.v4_students for each row
 execute function public.v4_lock_student_identity();

-- Bảo đảm ghi nhận theo tiết chỉ do người phụ trách tiết lưu, và không thêm sau khi đóng.
create or replace function public.v4_check_lesson_writable(sess uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.v4_sessions x where x.id=sess
  and x.teacher_id=auth.uid() and x.ended_at is null)
$$;
revoke all on function public.v4_check_lesson_writable(uuid) from public;
grant execute on function public.v4_check_lesson_writable(uuid) to authenticated;
create or replace function public.v4_guard_observation() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if new.session_id is not null and not public.v4_check_lesson_writable(new.session_id) then
  raise exception 'Chỉ giáo viên phụ trách được ghi nhận khi tiết còn mở';
 end if;
 return new;
end $$;
create trigger v4_guard_obs before insert on public.v4_observations
 for each row execute function public.v4_guard_observation();
create or replace function public.v4_guard_attendance() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if not public.v4_check_lesson_writable(new.session_id) then
  raise exception 'Tiết đã kết thúc hoặc không thuộc giáo viên này';
 end if;
 return new;
end $$;
create trigger v4_guard_att before insert or update on public.v4_attendance
 for each row execute function public.v4_guard_attendance();

-- Cảnh báo mở xuyên tiết: không bỏ sót khi quá 800 ghi nhận; quyền RLS của người gọi luôn áp dụng.
create or replace function public.v4_open_alerts(y text,c text)
returns setof public.v4_observations
language sql stable security invoker set search_path=public as $$
 select o.* from public.v4_observations o
 where o.school_year=y and o.class_code=c and o.is_alert
   and coalesce((select a.action from public.v4_alert_actions a
       where a.observation_id=o.id order by a.created_at desc,a.id desc limit 1),'monitoring')<>'resolved'
 order by o.observed_at desc
$$;
revoke all on function public.v4_open_alerts(text,text) from public;
grant execute on function public.v4_open_alerts(text,text) to authenticated;


-- Giao dịch nhập Excel nguyên khối: một lỗi sẽ hoàn tác tất cả thay đổi.
create or replace function public.v4_import_students(rows jsonb)
returns integer language plpgsql security definer set search_path=public as $$
declare rec jsonb; n integer:=0; yr text; cls text; code text; nm text; gender_value text;
begin
 if not public.v4_admin() then raise exception 'Chỉ quản trị được nhập Excel';end if;
 if jsonb_typeof(rows)<>'array' or jsonb_array_length(rows)<1 or jsonb_array_length(rows)>1500 then
  raise exception 'Danh sách phải là mảng có 1–1500 dòng';end if;
 for rec in select value from jsonb_array_elements(rows) loop
  yr=trim(rec->>'school_year');cls=trim(rec->>'class_code');
  code=trim(rec->>'student_code');nm=trim(rec->>'full_name');gender_value=rec->>'gender';
  if length(yr)<7 or length(cls)<1 or length(code)<1 or length(nm)<2
    or gender_value not in ('Nam','Nữ','Khác','Chưa rõ') then
   raise exception 'Dữ liệu học sinh chưa hợp lệ (mã: %)',code;end if;
  if exists(select 1 from public.v4_students st where st.school_year=yr and st.student_code=code
    and st.class_code<>cls) then
   raise exception 'Mã % đang thuộc lớp khác; không tự chuyển lớp bằng nhập Excel',code;end if;
  insert into public.v4_students(school_year,class_code,student_code,full_name,gender,birth_date,active)
   values(yr,cls,code,nm,gender_value,
          case when nullif(rec->>'birth_date','') is null then null else (rec->>'birth_date')::date end,true)
  on conflict(school_year,student_code) do update
   set full_name=excluded.full_name,gender=excluded.gender,birth_date=excluded.birth_date,active=true;
  n=n+1;
 end loop;
 return n;
end $$;
revoke all on function public.v4_import_students(jsonb) from public;
grant execute on function public.v4_import_students(jsonb) to authenticated;

-- Đếm điểm danh có bằng chứng trên số tiết có mở hệ thống; không mặc định chưa ghi nhận là có mặt.
create or replace function public.v4_attendance_report(y text,c text,d1 date,d2 date)
returns table(student_id uuid,total_sessions bigint,confirmed bigint,present bigint,absent bigint,late bigint,excused bigint)
language sql stable security invoker set search_path=public as $$
 select st.id,
 count(se.id),count(at.student_id),
 count(at.student_id) filter (where at.status='present'),
 count(at.student_id) filter (where at.status='absent'),
 count(at.student_id) filter (where at.status='late'),
 count(at.student_id) filter (where at.status='excused')
 from public.v4_students st
 left join public.v4_sessions se on se.school_year=st.school_year and se.class_code=st.class_code
   and se.lesson_date between d1 and d2
 left join public.v4_attendance at on at.session_id=se.id and at.student_id=st.id
 where st.school_year=y and st.class_code=c and st.active
 group by st.id
$$;
revoke all on function public.v4_attendance_report(text,text,date,date) from public;
grant execute on function public.v4_attendance_report(text,text,date,date) to authenticated;

-- Không cho mở lại tiết đã kết thúc hoặc lặng lẽ đổi nguồn/phiên bản/môn.
create or replace function public.v4_lock_session_identity() returns trigger language plpgsql as $$
begin
 if row(old.id,old.school_year,old.class_code,old.lesson_date,old.period_no,old.teacher_id,
  old.created_at,old.subject,old.timetable_version_id,old.source,old.override_reason)
  is distinct from row(new.id,new.school_year,new.class_code,new.lesson_date,new.period_no,new.teacher_id,
  new.created_at,new.subject,new.timetable_version_id,new.source,new.override_reason) then
   raise exception 'Không được sửa định danh/nguồn tiết học';end if;
 if old.ended_at is not null and new.ended_at is distinct from old.ended_at then
   raise exception 'Tiết đã kết thúc không thể mở lại';end if;
 return new;
end $$;


-- Tăng tốc truy vấn một lớp trong suốt năm học.
create index if not exists v4_obs_class_time_idx on public.v4_observations(school_year,class_code,observed_at desc);
create index if not exists v4_obs_student_time_idx on public.v4_observations(student_id,observed_at desc);
create index if not exists v4_actions_recent_idx on public.v4_alert_actions(observation_id,created_at desc,id desc);
create index if not exists v4_session_range_idx on public.v4_sessions(school_year,class_code,lesson_date,period_no);

-- Nhật ký can thiệp sư phạm của GVCN, không phải kết luận tự động.
create table if not exists public.v4_support_logs(
 id uuid primary key default gen_random_uuid(),school_year text not null,class_code text not null,
 student_id uuid not null,activity_type text not null check(activity_type in('trao_doi_hs','lien_he_ph','bien_phap','theo_doi')),
 content text not null check(length(trim(content)) between 5 and 1500),
 follow_up_on date,created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),
 foreign key(student_id,school_year,class_code) references public.v4_students(id,school_year,class_code)
);
create index if not exists v4_support_by_class_idx on public.v4_support_logs(school_year,class_code,created_at desc);
alter table public.v4_support_logs enable row level security;
create or replace function public.v4_actual_homeroom(y text,c text) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.v4_class_access
  where user_id=auth.uid() and school_year=y and class_code=c and role='gvcn')
$$;
revoke all on function public.v4_actual_homeroom(text,text) from public;
grant execute on function public.v4_actual_homeroom(text,text) to authenticated;
create policy v4_support_select on public.v4_support_logs for select to authenticated
 using(public.v4_actual_homeroom(school_year,class_code));
create policy v4_support_insert on public.v4_support_logs for insert to authenticated
 with check(created_by=auth.uid() and public.v4_actual_homeroom(school_year,class_code));
-- Không cho sửa/xóa nhật ký xử lý; nếu cần đính chính tạo một bản ghi mới.
grant select,insert on public.v4_support_logs to authenticated;

-- Danh mục hành vi: quản trị duy trì, GV chọn nhanh; không tự động đưa ra kết luận.
create table if not exists public.v4_behaviors(
 id bigint generated always as identity primary key,
 category text not null check(category in('positive','concern','health')),
 behavior_code text not null unique check(length(trim(behavior_code)) between 2 and 120),
 active boolean not null default true,
 sort_order integer not null default 100
);
insert into public.v4_behaviors(category,behavior_code,sort_order) values
 ('positive','Tích cực phát biểu',1),('positive','Chủ động giúp bạn',2),('positive','Hoàn thành nhiệm vụ',3),
 ('positive','Hợp tác nhóm',4),('positive','Tiến bộ rõ rệt',5),
 ('concern','Không tập trung',10),('concern','Nói chuyện riêng',11),('concern','Không ghi bài',12),
 ('concern','Chưa hợp tác',13),('concern','Chọc ghẹo bạn',14),('concern','Chưa làm bài',15),('concern','Mất trật tự',16),
 ('health','Đau bụng',20),('health','Đau đầu',21),('health','Mệt',22),('health','Cần theo dõi sức khỏe',23)
 on conflict(behavior_code) do nothing;
alter table public.v4_behaviors enable row level security;
create policy v4_behavior_read on public.v4_behaviors for select to authenticated using(true);
create policy v4_behavior_insert on public.v4_behaviors for insert to authenticated with check(public.v4_admin());
create policy v4_behavior_edit on public.v4_behaviors for update to authenticated using(public.v4_admin()) with check(public.v4_admin());
grant select,insert,update on public.v4_behaviors to authenticated;
grant usage,select on sequence public.v4_behaviors_id_seq to authenticated;


-- Tra cứu phiên bản chỉnh sửa: chỉ người tạo hoặc GVCN lớp được xem.
-- Không mở quyền SELECT trực tiếp lên bảng audit chứa bản ghi cũ.
create or replace function public.v4_observation_edit_history(ob uuid)
 returns table(changed_at timestamptz,old_note text,changed_by uuid)
 language plpgsql stable security definer set search_path=public as $$
begin
 if auth.uid() is null or not exists(
  select 1 from public.v4_observations o where o.id=ob
    and (o.created_by=auth.uid() or public.v4_actual_homeroom(o.school_year,o.class_code))
 ) then raise exception 'Không có quyền xem lịch sử chỉnh sửa'; end if;
 return query
  select a.changed_at,a.old_row->>'note',a.changed_by
  from public.v4_audit a
  where a.table_name='v4_observations' and a.row_id=ob::text
  order by a.changed_at desc limit 100;
end $$;
revoke all on function public.v4_observation_edit_history(uuid) from public;
grant execute on function public.v4_observation_edit_history(uuid) to authenticated;

-- SOURCE 03_v6_seating_tkb_sync.sql
-- V6 incremental migration. Run AFTER 01_v4_new_module.sql on a staging clone.
-- No ALTER/DROP of tkb_* tables; reads published TKB only.

ALTER TABLE public.v4_layouts ADD COLUMN IF NOT EXISTS is_confirmed boolean NOT NULL DEFAULT false;
ALTER TABLE public.v4_layouts ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;
ALTER TABLE public.v4_layouts ADD COLUMN IF NOT EXISTS confirmed_by uuid REFERENCES auth.users(id);

-- Existing pre-V6 layouts MUST start pending: no retroactive approval.
CREATE OR REPLACE FUNCTION public.v4_layout_approval_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE total_students integer; total_seated integer; invalid_positions integer; needs_approval boolean:=false;
BEGIN
 IF TG_OP='INSERT' THEN
  needs_approval=NEW.is_confirmed;
 ELSE
  IF NEW.desk_counts IS DISTINCT FROM OLD.desk_counts THEN
   NEW.is_confirmed=false;
  END IF;
  needs_approval=NEW.is_confirmed AND NOT OLD.is_confirmed;
 END IF;
 IF needs_approval THEN
  IF NOT public.v4_actual_homeroom(NEW.school_year,NEW.class_code) THEN
   RAISE EXCEPTION 'Chỉ GVCN được chốt sơ đồ';
  END IF;
  SELECT count(*) INTO total_students FROM public.v4_students
    WHERE school_year=NEW.school_year AND class_code=NEW.class_code AND active;
  SELECT count(*) INTO total_seated FROM public.v4_seats a
    JOIN public.v4_students s ON s.id=a.student_id
    WHERE a.school_year=NEW.school_year AND a.class_code=NEW.class_code AND s.active;
  SELECT count(*) INTO invalid_positions FROM public.v4_seats a
    WHERE a.school_year=NEW.school_year AND a.class_code=NEW.class_code
      AND a.desk_no>(NEW.desk_counts->>(a.group_no-1))::integer;
  IF total_students=0 OR total_seated<>total_students OR invalid_positions>0 THEN
   RAISE EXCEPTION 'Phải xếp đủ học sinh vào các bàn hợp lệ trước khi chốt (%/% học sinh)',total_seated,total_students;
  END IF;
  NEW.confirmed_at=now(); NEW.confirmed_by=auth.uid();
 ELSIF NOT NEW.is_confirmed THEN
  NEW.confirmed_at=NULL; NEW.confirmed_by=NULL;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS v4_guard_layout_approval ON public.v4_layouts;
CREATE TRIGGER v4_guard_layout_approval BEFORE INSERT OR UPDATE OF is_confirmed,desk_counts ON public.v4_layouts
 FOR EACH ROW EXECUTE FUNCTION public.v4_layout_approval_guard();

-- Any rearrangement automatically requires a fresh homeroom confirmation.
CREATE OR REPLACE FUNCTION public.v4_invalidate_layout_on_seat_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE public.v4_layouts SET is_confirmed=false,updated_at=now(),updated_by=auth.uid()
 WHERE school_year=CASE WHEN TG_OP='DELETE' THEN OLD.school_year ELSE NEW.school_year END
   AND class_code=CASE WHEN TG_OP='DELETE' THEN OLD.class_code ELSE NEW.class_code END;
 RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS v4_invalidate_on_seat_change ON public.v4_seats;
CREATE TRIGGER v4_invalidate_on_seat_change AFTER INSERT OR UPDATE OR DELETE ON public.v4_seats
 FOR EACH ROW EXECUTE FUNCTION public.v4_invalidate_layout_on_seat_change();

-- New/activated students make an old approved layout incomplete.
CREATE OR REPLACE FUNCTION public.v4_invalidate_layout_on_roster_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='INSERT' OR (TG_OP='UPDATE' AND OLD.active IS DISTINCT FROM NEW.active) THEN
  UPDATE public.v4_layouts SET is_confirmed=false,updated_at=now()
   WHERE school_year=NEW.school_year AND class_code=NEW.class_code;
 END IF;
 RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS v4_invalidate_on_roster_change ON public.v4_students;
CREATE TRIGGER v4_invalidate_on_roster_change AFTER INSERT OR UPDATE OF active ON public.v4_students
 FOR EACH ROW EXECUTE FUNCTION public.v4_invalidate_layout_on_roster_change();

-- Replace legacy policies that treated an Admin as GVCN.
DROP POLICY IF EXISTS v4_layout_manage ON public.v4_layouts;
DROP POLICY IF EXISTS v4_layout_edit ON public.v4_layouts;
DROP POLICY IF EXISTS v4_seat_add ON public.v4_seats;
DROP POLICY IF EXISTS v4_seat_edit ON public.v4_seats;
DROP POLICY IF EXISTS v4_seat_delete ON public.v4_seats;
CREATE POLICY v4_layout_manage ON public.v4_layouts FOR INSERT TO authenticated
 WITH CHECK(public.v4_actual_homeroom(school_year,class_code));
CREATE POLICY v4_layout_edit ON public.v4_layouts FOR UPDATE TO authenticated
 USING(public.v4_actual_homeroom(school_year,class_code))
 WITH CHECK(public.v4_actual_homeroom(school_year,class_code));
CREATE POLICY v4_seat_add ON public.v4_seats FOR INSERT TO authenticated
 WITH CHECK(public.v4_actual_homeroom(school_year,class_code));
CREATE POLICY v4_seat_edit ON public.v4_seats FOR UPDATE TO authenticated
 USING(public.v4_actual_homeroom(school_year,class_code))
 WITH CHECK(public.v4_actual_homeroom(school_year,class_code));
CREATE POLICY v4_seat_delete ON public.v4_seats FOR DELETE TO authenticated
 USING(public.v4_actual_homeroom(school_year,class_code));

-- No admin exception for seat management. Admin manages system, not classroom seating.
CREATE OR REPLACE FUNCTION public.v4_assign_seat(y text,c text,g integer,d integer,s integer,st uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer;
BEGIN
 IF NOT public.v4_actual_homeroom(y,c) THEN RAISE EXCEPTION 'Chỉ GVCN được xếp chỗ'; END IF;
 IF g NOT BETWEEN 1 AND 4 OR d<1 OR s NOT IN (1,2) THEN RAISE EXCEPTION 'Vị trí không hợp lệ'; END IF;
 SELECT (desk_counts->>(g-1))::integer INTO n FROM public.v4_layouts WHERE school_year=y AND class_code=c FOR UPDATE;
 IF n IS NULL OR d>n THEN RAISE EXCEPTION 'Chưa thiết lập bàn hợp lệ'; END IF;
 IF st IS NOT NULL AND NOT public.v4_student_class(st,y,c) THEN RAISE EXCEPTION 'Học sinh không thuộc lớp'; END IF;
 IF st IS NOT NULL THEN DELETE FROM public.v4_seats WHERE school_year=y AND class_code=c AND student_id=st; END IF;
 DELETE FROM public.v4_seats WHERE school_year=y AND class_code=c AND group_no=g AND desk_no=d AND seat_no=s;
 IF st IS NOT NULL THEN INSERT INTO public.v4_seats(school_year,class_code,group_no,desk_no,seat_no,student_id)
 VALUES(y,c,g,d,s,st); END IF;
END $$;
CREATE OR REPLACE FUNCTION public.v4_set_desks(y text,c text,g integer,n integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.v4_actual_homeroom(y,c) THEN RAISE EXCEPTION 'Chỉ GVCN được thêm/bớt bàn'; END IF;
 IF g NOT BETWEEN 1 AND 4 OR n NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'Số bàn không hợp lệ'; END IF;
 INSERT INTO public.v4_layouts(school_year,class_code,updated_by)
 VALUES(y,c,auth.uid()) ON CONFLICT(school_year,class_code) DO NOTHING;
 UPDATE public.v4_layouts SET desk_counts=jsonb_set(desk_counts,ARRAY[(g-1)::text],to_jsonb(n)),
 is_confirmed=false,updated_at=now(),updated_by=auth.uid()
 WHERE school_year=y AND class_code=c;
 DELETE FROM public.v4_seats WHERE school_year=y AND class_code=c AND group_no=g AND desk_no>n;
END $$;
CREATE OR REPLACE FUNCTION public.v4_confirm_layout(y text,c text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.v4_actual_homeroom(y,c) THEN RAISE EXCEPTION 'Chỉ GVCN được chốt sơ đồ'; END IF;
 UPDATE public.v4_layouts SET is_confirmed=true,updated_at=now(),updated_by=auth.uid()
 WHERE school_year=y AND class_code=c;
 IF NOT FOUND THEN RAISE EXCEPTION 'Chưa có sơ đồ để chốt'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.v4_confirm_layout(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v4_confirm_layout(text,text) TO authenticated;

-- Administrative visibility is not a license to teach a lesson or create student notes.
CREATE OR REPLACE FUNCTION public.v4_actual_class_access(y text,c text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS(
  SELECT 1 FROM public.v4_class_access WHERE user_id=auth.uid()
    AND school_year=y AND class_code=c
 )
$$;
REVOKE ALL ON FUNCTION public.v4_actual_class_access(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v4_actual_class_access(text,text) TO authenticated;
DROP POLICY IF EXISTS v4_session_create ON public.v4_sessions;
CREATE POLICY v4_session_create ON public.v4_sessions FOR INSERT TO authenticated
 WITH CHECK(teacher_id=auth.uid() AND public.v4_actual_class_access(school_year,class_code));
DROP POLICY IF EXISTS v4_obs_add ON public.v4_observations;
CREATE POLICY v4_obs_add ON public.v4_observations FOR INSERT TO authenticated
 WITH CHECK(created_by=auth.uid() AND public.v4_actual_class_access(school_year,class_code));
DROP POLICY IF EXISTS v4_obs_edit ON public.v4_observations;
CREATE POLICY v4_obs_edit ON public.v4_observations FOR UPDATE TO authenticated
 USING(created_by=auth.uid() AND public.v4_actual_class_access(school_year,class_code))
 WITH CHECK(created_by=auth.uid() AND public.v4_actual_class_access(school_year,class_code));

-- Link a verified Auth account to a TKB teacher identity WITHOUT granting a class.
-- Class permissions are created only by the separate reviewed TKB sync step.
CREATE OR REPLACE FUNCTION public.v4_admin_link_teacher(em text,code text,fullname text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid;
BEGIN
 IF NOT public.v4_admin() THEN RAISE EXCEPTION 'Chỉ quản trị được liên kết giáo viên'; END IF;
 IF length(btrim(code))<1 OR length(btrim(fullname))<2 THEN RAISE EXCEPTION 'Thiếu mã hoặc họ tên giáo viên'; END IF;
 SELECT id INTO uid FROM auth.users WHERE lower(email)=lower(btrim(em)) LIMIT 1;
 IF uid IS NULL THEN RAISE EXCEPTION 'Email chưa có tài khoản Supabase Auth'; END IF;
 INSERT INTO public.v4_teachers(user_id,teacher_code,teacher_name)
 VALUES(uid,btrim(code),btrim(fullname))
 ON CONFLICT(user_id) DO UPDATE SET teacher_code=excluded.teacher_code,teacher_name=excluded.teacher_name;
 RETURN uid::text;
END $$;
REVOKE ALL ON FUNCTION public.v4_admin_link_teacher(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v4_admin_link_teacher(text,text,text) TO authenticated;

-- Synchronize class permissions from published timetable, with explicit verified identities.
-- Manually-granted access is preserved and never automatically revoked.
CREATE TABLE IF NOT EXISTS public.v4_tkb_auto_grants(
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 school_year text NOT NULL,class_code text NOT NULL,
 role text NOT NULL CHECK(role IN ('gvbm','gvcn')),
 version_id text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,school_year,class_code,role)
);
ALTER TABLE public.v4_tkb_auto_grants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS v4_tkb_grants_admin_read ON public.v4_tkb_auto_grants;
CREATE POLICY v4_tkb_grants_admin_read ON public.v4_tkb_auto_grants FOR SELECT TO authenticated USING(public.v4_admin());
REVOKE ALL ON public.v4_tkb_auto_grants FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.v4_tkb_auto_grants TO authenticated;

-- This function deliberately uses exact teacher_code for GVBM and exact FULL teacher_name for GVCN.
-- Ambiguous or unbound teacher names are reported and never guessed.
CREATE OR REPLACE FUNCTION public.v4_sync_published_tkb()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v record; r record; identity_count integer; teacher_uid uuid;
        desired jsonb:='[]'::jsonb; current_pair jsonb;
        oldpair record; inserted_rows integer; added integer:=0; removed integer:=0;
        unresolved jsonb:='[]'::jsonb;
BEGIN
 IF NOT public.v4_admin() THEN RAISE EXCEPTION 'Chỉ quản trị được đồng bộ PCCM'; END IF;
 SELECT id,school_year,version_name INTO v FROM public.tkb_versions
 WHERE status='published' AND is_active=true ORDER BY published_at DESC LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'Chưa có TKB đã công bố'; END IF;
 -- Never revoke permissions if the published version lacks a complete PCCM/GVCN sheet.
 IF NOT EXISTS(SELECT 1 FROM public.tkb_assignments a WHERE a.version_id=v.id) THEN
  RETURN jsonb_build_object('applied',false,'version',v.version_name,'added',0,'removed',0,
   'reason','Phiên bản TKB chưa có dữ liệu PCCM/GVCN','unresolved','[]'::jsonb);
 END IF;
 IF EXISTS(
  SELECT 1 FROM (SELECT DISTINCT class_code FROM public.tkb_entries WHERE version_id=v.id) x
  WHERE nullif(btrim(x.class_code),'') IS NOT NULL AND NOT EXISTS(
   SELECT 1 FROM public.tkb_assignments a WHERE a.version_id=v.id
    AND btrim(a.homeroom_class)=btrim(x.class_code)
  )
 ) THEN
  RETURN jsonb_build_object('applied',false,'version',v.version_name,'added',0,'removed',0,
   'reason','Chưa có GVCN trong PCCM cho đủ các lớp','unresolved','[]'::jsonb);
 END IF;
 -- Teacher subject assignments keyed to verified TKB teacher_code.
 FOR r IN SELECT DISTINCT e.teacher_code,e.class_code FROM public.tkb_entries e
          WHERE e.version_id=v.id AND e.class_code IS NOT NULL AND nullif(btrim(e.teacher_code),'') IS NOT NULL LOOP
  SELECT count(*),min(t.user_id::text)::uuid INTO identity_count,teacher_uid
  FROM public.v4_teachers t WHERE t.teacher_code=r.teacher_code;
  IF identity_count=1 AND nullif(btrim(r.teacher_code),'') IS NOT NULL THEN
   desired=desired||jsonb_build_array(jsonb_build_object('uid',teacher_uid,'year',v.school_year,'cls',r.class_code,'role','gvbm'));
  ELSE
   unresolved=unresolved||jsonb_build_array(jsonb_build_object('type','gvbm','code',r.teacher_code,'class',r.class_code));
  END IF;
 END LOOP;
 -- Homeroom owner keyed to exact full name in authoritative TKB assignment sheet.
 FOR r IN SELECT DISTINCT a.homeroom_class,a.teacher_name FROM public.tkb_assignments a
   WHERE a.version_id=v.id AND nullif(btrim(a.homeroom_class),'') IS NOT NULL LOOP
  SELECT count(*),min(t.user_id::text)::uuid INTO identity_count,teacher_uid
   FROM public.v4_teachers t WHERE lower(regexp_replace(btrim(t.teacher_name),'\s+',' ','g'))=
    lower(regexp_replace(btrim(r.teacher_name),'\s+',' ','g'));
  IF identity_count=1 THEN
   desired=desired||jsonb_build_array(jsonb_build_object('uid',teacher_uid,'year',v.school_year,'cls',r.homeroom_class,'role','gvcn'));
  ELSE
   unresolved=unresolved||jsonb_build_array(jsonb_build_object('type','gvcn','teacher',r.teacher_name,'class',r.homeroom_class));
  END IF;
 END LOOP;
 -- Conflict safety: abort rather than changing GVCN when two assignments claim one class.
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(desired) AS a(value)
    WHERE a.value->>'role'='gvcn' GROUP BY a.value->>'year',a.value->>'cls' HAVING count(DISTINCT a.value->>'uid')>1)
 THEN RAISE EXCEPTION 'PCCM chứa nhiều GVCN cho một lớp; cần kiểm tra Excel'; END IF;
 -- Also abort before revoking the previous GVCN when a new GVCN cannot be verified.
 IF jsonb_array_length(unresolved)>0 THEN
  RETURN jsonb_build_object('applied',false,'version',v.version_name,'added',0,'removed',0,'unresolved',unresolved,'reason','Có giáo viên/PCCM chưa được liên kết tài khoản');
 END IF;
 -- Do not silently ignore a conflicting manually assigned GVCN.
 IF EXISTS(
  SELECT 1 FROM jsonb_array_elements(desired) AS x(value)
  JOIN public.v4_class_access ca ON ca.school_year=x.value->>'year'
    AND ca.class_code=x.value->>'cls' AND ca.role='gvcn'
    AND ca.user_id::text<>x.value->>'uid'
  LEFT JOIN public.v4_tkb_auto_grants aut ON aut.user_id=ca.user_id
   AND aut.school_year=ca.school_year AND aut.class_code=ca.class_code AND aut.role=ca.role
  WHERE x.value->>'role'='gvcn' AND aut.user_id IS NULL
 ) THEN
  RETURN jsonb_build_object('applied',false,'version',v.version_name,'added',0,'removed',0,
   'unresolved',unresolved,'reason','GVCN được cấp thủ công đang khác PCCM; quản trị phải đối chiếu');
 END IF;
 -- Sync only rows this process owns. Preserve all manual grants.
 FOR oldpair IN SELECT * FROM public.v4_tkb_auto_grants WHERE school_year=v.school_year LOOP
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(desired) AS x(value)
     WHERE x.value->>'uid'=oldpair.user_id::text AND x.value->>'year'=oldpair.school_year
       AND x.value->>'cls'=oldpair.class_code AND x.value->>'role'=oldpair.role) THEN
   DELETE FROM public.v4_class_access WHERE user_id=oldpair.user_id AND school_year=oldpair.school_year
    AND class_code=oldpair.class_code AND role=oldpair.role;
   DELETE FROM public.v4_tkb_auto_grants WHERE user_id=oldpair.user_id AND school_year=oldpair.school_year
    AND class_code=oldpair.class_code AND role=oldpair.role;
   IF oldpair.role='gvcn' THEN
    UPDATE public.v4_layouts SET is_confirmed=false,updated_at=now()
     WHERE school_year=oldpair.school_year AND class_code=oldpair.class_code;
   END IF;
   removed=removed+1;
  END IF;
 END LOOP;
 FOR current_pair IN SELECT DISTINCT value FROM jsonb_array_elements(desired) LOOP
  INSERT INTO public.v4_class_access(user_id,school_year,class_code,role)
   VALUES((current_pair->>'uid')::uuid,current_pair->>'year',current_pair->>'cls',current_pair->>'role')
   ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS inserted_rows=ROW_COUNT;
  IF inserted_rows>0 THEN
   added=added+1;
   IF current_pair->>'role'='gvcn' THEN
    UPDATE public.v4_layouts SET is_confirmed=false,updated_at=now()
     WHERE school_year=current_pair->>'year' AND class_code=current_pair->>'cls';
   END IF;
   INSERT INTO public.v4_tkb_auto_grants(user_id,school_year,class_code,role,version_id)
    VALUES((current_pair->>'uid')::uuid,current_pair->>'year',current_pair->>'cls',current_pair->>'role',v.id::text)
    ON CONFLICT(user_id,school_year,class_code,role) DO UPDATE SET version_id=excluded.version_id;
  ELSE
   UPDATE public.v4_tkb_auto_grants SET version_id=v.id::text
    WHERE user_id=(current_pair->>'uid')::uuid AND school_year=current_pair->>'year'
     AND class_code=current_pair->>'cls' AND role=current_pair->>'role';
  END IF;
 END LOOP;
 RETURN jsonb_build_object('applied',true,'version',v.version_name,'added',added,'removed',removed,'unresolved',unresolved);
END $$;
REVOKE ALL ON FUNCTION public.v4_sync_published_tkb() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v4_sync_published_tkb() TO authenticated;

-- SOURCE 05_v6_flexible_groups.sql
-- After 01 + 03. Flexible groups approved 23/10/2026. No changes to tkb_*.

CREATE OR REPLACE FUNCTION public.v4_valid_desks(j jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE v text;
BEGIN
 IF j IS NULL OR jsonb_typeof(j)<>'array' THEN RETURN false; END IF;
 IF jsonb_array_length(j) NOT BETWEEN 1 AND 12 THEN RETURN false; END IF;
 FOR v IN SELECT jsonb_array_elements_text(j) LOOP
  IF v IS NULL OR v !~ '^[0-9]{1,2}$' OR v::int NOT BETWEEN 1 AND 20 THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
END $$;
ALTER TABLE public.v4_layouts DROP CONSTRAINT IF EXISTS valid_desk_counts;
ALTER TABLE public.v4_seats DROP CONSTRAINT IF EXISTS v4_seats_group_no_check;
ALTER TABLE public.v4_seats ADD CONSTRAINT v4_seats_group_no_check CHECK(group_no BETWEEN 1 AND 12);

CREATE OR REPLACE FUNCTION public.v4_validate_seat_position() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer;
BEGIN
 SELECT (desk_counts->>(NEW.group_no-1))::integer INTO n FROM public.v4_layouts
 WHERE school_year=NEW.school_year AND class_code=NEW.class_code FOR UPDATE;
 IF n IS NULL OR NEW.desk_no>n OR NOT public.v4_student_class(NEW.student_id,NEW.school_year,NEW.class_code) THEN
  RAISE EXCEPTION 'Học sinh hoặc vị trí không thuộc sơ đồ lớp';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS v4_check_seat_position ON public.v4_seats;
CREATE TRIGGER v4_check_seat_position BEFORE INSERT OR UPDATE ON public.v4_seats
 FOR EACH ROW EXECUTE FUNCTION public.v4_validate_seat_position();

CREATE OR REPLACE FUNCTION public.v4_set_group_count(y text,c text,n integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE counts jsonb; i integer;
BEGIN
 IF NOT public.v4_actual_homeroom(y,c) THEN RAISE EXCEPTION 'Chỉ GVCN được thay đổi số tổ'; END IF;
 IF n IS NULL OR n NOT BETWEEN 1 AND 12 THEN RAISE EXCEPTION 'Số tổ phải từ 1 đến 12'; END IF;
 INSERT INTO public.v4_layouts(school_year,class_code,updated_by) VALUES(y,c,auth.uid()) ON CONFLICT DO NOTHING;
 SELECT desk_counts INTO counts FROM public.v4_layouts WHERE school_year=y AND class_code=c FOR UPDATE;
 IF n=jsonb_array_length(counts) THEN RETURN; END IF;
 IF n<jsonb_array_length(counts) THEN
  SELECT jsonb_agg(value ORDER BY ord) INTO counts FROM jsonb_array_elements(counts) WITH ORDINALITY t(value,ord) WHERE ord<=n;
 ELSE
  FOR i IN jsonb_array_length(counts)+1..n LOOP counts=counts||'[4]'::jsonb; END LOOP;
 END IF;
 DELETE FROM public.v4_seats WHERE school_year=y AND class_code=c AND group_no>n;
 UPDATE public.v4_layouts SET desk_counts=counts,is_confirmed=false,updated_at=now(),updated_by=auth.uid()
 WHERE school_year=y AND class_code=c;
END $$;
REVOKE ALL ON FUNCTION public.v4_set_group_count(text,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v4_set_group_count(text,text,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.v4_assign_seat(y text,c text,g integer,d integer,s integer,st uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer;
BEGIN
 IF NOT public.v4_actual_homeroom(y,c) THEN RAISE EXCEPTION 'Chỉ GVCN được xếp chỗ'; END IF;
 IF g IS NULL OR g NOT BETWEEN 1 AND 12 OR d IS NULL OR d<1 OR s IS NULL OR s NOT IN (1,2) THEN RAISE EXCEPTION 'Vị trí không hợp lệ'; END IF;
 SELECT (desk_counts->>(g-1))::integer INTO n FROM public.v4_layouts WHERE school_year=y AND class_code=c FOR UPDATE;
 IF n IS NULL OR d>n THEN RAISE EXCEPTION 'Chưa thiết lập bàn hợp lệ'; END IF;
 IF st IS NOT NULL AND NOT public.v4_student_class(st,y,c) THEN RAISE EXCEPTION 'Học sinh không thuộc lớp'; END IF;
 IF st IS NOT NULL THEN DELETE FROM public.v4_seats WHERE school_year=y AND class_code=c AND student_id=st; END IF;
 DELETE FROM public.v4_seats WHERE school_year=y AND class_code=c AND group_no=g AND desk_no=d AND seat_no=s;
 IF st IS NOT NULL THEN INSERT INTO public.v4_seats(school_year,class_code,group_no,desk_no,seat_no,student_id) VALUES(y,c,g,d,s,st); END IF;
END $$;

CREATE OR REPLACE FUNCTION public.v4_set_desks(y text,c text,g integer,n integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE counts jsonb;
BEGIN
 IF NOT public.v4_actual_homeroom(y,c) THEN RAISE EXCEPTION 'Chỉ GVCN được thêm/bớt bàn'; END IF;
 INSERT INTO public.v4_layouts(school_year,class_code,updated_by) VALUES(y,c,auth.uid()) ON CONFLICT DO NOTHING;
 SELECT desk_counts INTO counts FROM public.v4_layouts WHERE school_year=y AND class_code=c FOR UPDATE;
 IF g IS NULL OR g NOT BETWEEN 1 AND jsonb_array_length(counts) OR n IS NULL OR n NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'Tổ hoặc số bàn không hợp lệ'; END IF;
 DELETE FROM public.v4_seats WHERE school_year=y AND class_code=c AND group_no=g AND desk_no>n;
 UPDATE public.v4_layouts SET desk_counts=jsonb_set(counts,ARRAY[(g-1)::text],to_jsonb(n)),is_confirmed=false,updated_at=now(),updated_by=auth.uid()
 WHERE school_year=y AND class_code=c;
END $$;

-- SOURCE 06_v6_permission_hardening.sql
-- V6: fixes found by executable offline PostgreSQL/RLS tests.
-- Apply after 01, 03 and 05. Does not change tkb_* tables or their policies.

-- Ownership alone must never keep writing privileges after a class grant is revoked.
CREATE OR REPLACE FUNCTION public.v4_session_owner(s uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.v4_sessions x WHERE x.id=s
   AND x.teacher_id=auth.uid()
   AND public.v4_actual_class_access(x.school_year,x.class_code))
$$;
CREATE OR REPLACE FUNCTION public.v4_check_lesson_writable(sess uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.v4_sessions x WHERE x.id=sess
   AND x.teacher_id=auth.uid() AND x.ended_at IS NULL
   AND public.v4_actual_class_access(x.school_year,x.class_code))
$$;
DROP POLICY IF EXISTS v4_session_edit ON public.v4_sessions;
CREATE POLICY v4_session_edit ON public.v4_sessions FOR UPDATE TO authenticated
 USING(teacher_id=auth.uid() AND public.v4_actual_class_access(school_year,class_code))
 WITH CHECK(teacher_id=auth.uid() AND public.v4_actual_class_access(school_year,class_code));

-- The creator also needs current access: SECURITY DEFINER must not bypass revocation.
CREATE OR REPLACE FUNCTION public.v4_observation_edit_history(ob uuid)
RETURNS TABLE(changed_at timestamptz,old_note text,changed_by uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(
  SELECT 1 FROM public.v4_observations o WHERE o.id=ob
   AND public.v4_actual_class_access(o.school_year,o.class_code)
   AND (o.created_by=auth.uid() OR public.v4_actual_homeroom(o.school_year,o.class_code))
   AND (o.category<>'health' OR public.v4_health_access(o.school_year,o.class_code))
 ) THEN RAISE EXCEPTION 'Không có quyền xem lịch sử chỉnh sửa'; END IF;
 RETURN QUERY SELECT a.changed_at,a.old_row->>'note',a.changed_by FROM public.v4_audit a
  WHERE a.table_name='v4_observations' AND a.row_id=ob::text
  ORDER BY a.changed_at DESC,a.id DESC LIMIT 100;
END $$;

-- Timetable evidence must also match the requested school year.
CREATE OR REPLACE FUNCTION public.v4_verify_session() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE tcode text;
BEGIN
 IF NEW.source='tkb' THEN
  IF NEW.timetable_version_id IS NULL THEN RAISE EXCEPTION 'Chưa xác định bản thời khóa biểu'; END IF;
  SELECT teacher_code INTO tcode FROM public.v4_teachers WHERE user_id=NEW.teacher_id;
  IF tcode IS NULL OR NOT EXISTS(
   SELECT 1 FROM public.tkb_entries e JOIN public.tkb_versions v ON v.id=e.version_id
   WHERE e.version_id::text=NEW.timetable_version_id AND v.status='published' AND v.is_active=true
    AND v.school_year=NEW.school_year AND e.teacher_code=tcode AND e.class_code=NEW.class_code
    AND e.period_no=NEW.period_no AND e.day_no=extract(isodow FROM NEW.lesson_date)::integer+1
    AND e.subject=NEW.subject
  ) THEN RAISE EXCEPTION 'Tiết này không khớp TKB/năm học của giáo viên. Chọn chế độ dạy thay/thủ công và ghi lý do.'; END IF;
 ELSE
  IF length(btrim(NEW.override_reason))<10 THEN
   RAISE EXCEPTION 'Cần ghi lý do ít nhất 10 ký tự khi dạy thay/chọn thủ công';
  END IF;
 END IF;
 RETURN NEW;
END $$;

-- Approval metadata is server generated and immutable while an approval stays valid.
CREATE OR REPLACE FUNCTION public.v4_layout_approval_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE total_students integer; total_seated integer; invalid_positions integer; needs_approval boolean;
BEGIN
 IF TG_OP='INSERT' THEN needs_approval=NEW.is_confirmed;
 ELSE
  IF row(NEW.school_year,NEW.class_code) IS DISTINCT FROM row(OLD.school_year,OLD.class_code) THEN
   RAISE EXCEPTION 'Không được thay đổi năm học hoặc lớp của sơ đồ';
  END IF;
  IF NEW.desk_counts IS DISTINCT FROM OLD.desk_counts THEN NEW.is_confirmed=false; END IF;
  needs_approval=NEW.is_confirmed AND NOT OLD.is_confirmed;
 END IF;
 IF needs_approval THEN
  IF NOT public.v4_actual_homeroom(NEW.school_year,NEW.class_code) THEN
   RAISE EXCEPTION 'Chỉ GVCN được chốt sơ đồ';
  END IF;
  SELECT count(*) INTO total_students FROM public.v4_students
   WHERE school_year=NEW.school_year AND class_code=NEW.class_code AND active;
  SELECT count(*) INTO total_seated FROM public.v4_seats a JOIN public.v4_students s ON s.id=a.student_id
   WHERE a.school_year=NEW.school_year AND a.class_code=NEW.class_code AND s.active;
  SELECT count(*) INTO invalid_positions FROM public.v4_seats a
   WHERE a.school_year=NEW.school_year AND a.class_code=NEW.class_code
    AND (a.group_no<1 OR a.group_no>jsonb_array_length(NEW.desk_counts)
     OR a.desk_no>coalesce((NEW.desk_counts->>(a.group_no-1))::integer,0));
  IF total_students=0 OR total_seated<>total_students OR invalid_positions>0 THEN
   RAISE EXCEPTION 'Phải xếp đủ học sinh vào các bàn hợp lệ trước khi chốt (%/% học sinh)',total_seated,total_students;
  END IF;
  NEW.confirmed_at=now(); NEW.confirmed_by=auth.uid();
 ELSIF NOT NEW.is_confirmed THEN
  NEW.confirmed_at=NULL; NEW.confirmed_by=NULL;
 ELSE
  NEW.confirmed_at=OLD.confirmed_at; NEW.confirmed_by=OLD.confirmed_by;
 END IF;
 NEW.updated_by=auth.uid(); NEW.updated_at=now();
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS v4_guard_layout_approval ON public.v4_layouts;
CREATE TRIGGER v4_guard_layout_approval BEFORE INSERT OR UPDATE ON public.v4_layouts
 FOR EACH ROW EXECUTE FUNCTION public.v4_layout_approval_guard();
CREATE OR REPLACE FUNCTION public.v4_lock_seat_class() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF row(NEW.school_year,NEW.class_code) IS DISTINCT FROM row(OLD.school_year,OLD.class_code) THEN
  RAISE EXCEPTION 'Không được chuyển vị trí sang sơ đồ của lớp khác';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS v4_lock_seat_class ON public.v4_seats;
CREATE TRIGGER v4_lock_seat_class BEFORE UPDATE ON public.v4_seats
 FOR EACH ROW EXECUTE FUNCTION public.v4_lock_seat_class();

-- Linking an email must only target an account that has proved control of that email.
CREATE OR REPLACE FUNCTION public.v4_admin_link_teacher(em text,code text,fullname text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid;
BEGIN
 IF NOT public.v4_admin() THEN RAISE EXCEPTION 'Chỉ quản trị được liên kết giáo viên'; END IF;
 IF length(btrim(coalesce(code,'')))<1 OR length(btrim(coalesce(fullname,'')))<2 THEN
  RAISE EXCEPTION 'Thiếu mã hoặc họ tên giáo viên';
 END IF;
 SELECT id INTO uid FROM auth.users WHERE lower(email)=lower(btrim(em)) AND email_confirmed_at IS NOT NULL;
 IF uid IS NULL THEN RAISE EXCEPTION 'Email chưa có tài khoản Supabase Auth đã xác nhận'; END IF;
 INSERT INTO public.v4_teachers(user_id,teacher_code,teacher_name) VALUES(uid,btrim(code),btrim(fullname))
  ON CONFLICT(user_id) DO UPDATE SET teacher_code=excluded.teacher_code,teacher_name=excluded.teacher_name;
 RETURN uid::text;
END $$;
CREATE OR REPLACE FUNCTION public.v4_admin_bind_teacher(em text,code text,fullname text,year text,cls text,job text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid;
BEGIN
 IF NOT public.v4_admin() THEN RAISE EXCEPTION 'Chỉ quản trị được cấp quyền'; END IF;
 IF job IS NULL OR job NOT IN('gvbm','gvcn') OR length(btrim(coalesce(year,'')))<7 OR length(btrim(coalesce(cls,'')))<1 THEN
  RAISE EXCEPTION 'Thông tin chưa hợp lệ';
 END IF;
 uid=public.v4_admin_link_teacher(em,code,fullname)::uuid;
 INSERT INTO public.v4_class_access(user_id,school_year,class_code,role)
  VALUES(uid,btrim(year),btrim(cls),job) ON CONFLICT DO NOTHING;
 RETURN uid::text;
END $$;

-- Track grants/revocations and identity changes without exposing the audit table to clients.
ALTER TABLE public.v4_audit ADD COLUMN IF NOT EXISTS operation text NOT NULL DEFAULT 'UPDATE';
ALTER TABLE public.v4_audit ADD COLUMN IF NOT EXISTS new_row jsonb;
CREATE OR REPLACE FUNCTION public.v4_audit_permission_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE before_row jsonb; after_row jsonb; key_row jsonb;
BEGIN
 IF TG_OP<>'INSERT' THEN before_row=to_jsonb(OLD); END IF;
 IF TG_OP<>'DELETE' THEN after_row=to_jsonb(NEW); END IF;
 key_row=coalesce(after_row,before_row);
 INSERT INTO public.v4_audit(table_name,row_id,old_row,new_row,operation,changed_by)
  VALUES(TG_TABLE_NAME,concat_ws('|',key_row->>'user_id',key_row->>'school_year',key_row->>'class_code',key_row->>'role'),
   before_row,after_row,TG_OP,auth.uid());
 -- A manual homeroom change needs the same fresh confirmation as a TKB sync.
 IF TG_TABLE_NAME='v4_class_access' THEN
  IF before_row->>'role'='gvcn' THEN
   UPDATE public.v4_layouts SET is_confirmed=false
    WHERE school_year=before_row->>'school_year' AND class_code=before_row->>'class_code';
  END IF;
  IF after_row->>'role'='gvcn' THEN
   UPDATE public.v4_layouts SET is_confirmed=false
    WHERE school_year=after_row->>'school_year' AND class_code=after_row->>'class_code';
  END IF;
 END IF;
 RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS v4_audit_access ON public.v4_class_access;
CREATE TRIGGER v4_audit_access AFTER INSERT OR UPDATE OR DELETE ON public.v4_class_access
 FOR EACH ROW EXECUTE FUNCTION public.v4_audit_permission_change();
DROP TRIGGER IF EXISTS v4_audit_teacher_binding ON public.v4_teachers;
CREATE TRIGGER v4_audit_teacher_binding AFTER INSERT OR UPDATE OR DELETE ON public.v4_teachers
 FOR EACH ROW EXECUTE FUNCTION public.v4_audit_permission_change();

REVOKE ALL ON FUNCTION public.v4_audit_permission_change() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.v4_lock_seat_class() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.v4_session_owner(uuid),public.v4_check_lesson_writable(uuid),
 public.v4_observation_edit_history(uuid),public.v4_admin_link_teacher(text,text,text),
 public.v4_admin_bind_teacher(text,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.v4_session_owner(uuid),public.v4_check_lesson_writable(uuid),
 public.v4_observation_edit_history(uuid),public.v4_admin_link_teacher(text,text,text),
 public.v4_admin_bind_teacher(text,text,text,text,text,text) TO authenticated;

-- SOURCE 08_v6_school_times.sql
-- Morning timetable confirmed by the school on 23/10/2026.
-- Opening activity 07:00–07:15 is not a numbered lesson.

INSERT INTO public.v4_lesson_times(period_no,start_time,end_time) VALUES
 (1,'07:15','08:00'),(2,'08:00','08:45'),(3,'08:55','09:40'),
 (4,'09:40','10:25'),(5,'10:30','11:15')
ON CONFLICT(period_no) DO UPDATE SET start_time=excluded.start_time,end_time=excluded.end_time;

CREATE OR REPLACE FUNCTION public.v4_check_time_overlap() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.v4_lesson_times a JOIN public.v4_lesson_times b
  ON a.period_no<b.period_no AND a.start_time<b.end_time AND b.start_time<a.end_time) THEN
  RAISE EXCEPTION 'Khung giờ các tiết không được chồng nhau';
 END IF;
 RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS v4_guard_time_overlap ON public.v4_lesson_times;
CREATE CONSTRAINT TRIGGER v4_guard_time_overlap AFTER INSERT OR UPDATE ON public.v4_lesson_times
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.v4_check_time_overlap();
REVOKE ALL ON FUNCTION public.v4_check_time_overlap() FROM PUBLIC,anon,authenticated;

-- SOURCE 09_v6_sync_preview.sql
-- Read-only permission diff and version-checked apply. After 01,03,05,06,08.

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

-- SOURCE 10_v6_publish_integration.sql
-- One publish action updates the timetable and attempts verified PCCM synchronization.
-- Unresolved identities remain explicitly pending; no guessed permissions are created.

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

-- SOURCE 11_v6_focused_reminders.sql
-- Ordinary observations remain in history; reminders require health or an
-- explicit unusual-situation mark by the teacher. Do not classify old concerns.

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

-- SOURCE 12_v6_same_day_assessment.sql
-- A lesson becomes read-only after its school day, even if never closed.

CREATE OR REPLACE FUNCTION public.v4_school_today() RETURNS date
LANGUAGE sql STABLE SET search_path=public AS $$
 SELECT (statement_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
$$;

CREATE OR REPLACE FUNCTION public.v4_check_lesson_writable(sess uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.v4_sessions x WHERE x.id=sess
   AND x.teacher_id=auth.uid() AND x.ended_at IS NULL
   AND x.lesson_date=public.v4_school_today()
   AND public.v4_actual_class_access(x.school_year,x.class_code))
$$;

CREATE OR REPLACE FUNCTION public.v4_same_day_session_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.lesson_date<>public.v4_school_today() THEN
  RAISE EXCEPTION 'Chỉ được ghi nhận tiết học trong ngày hiện tại (giờ Việt Nam)';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS v4_same_day_session ON public.v4_sessions;
CREATE TRIGGER v4_same_day_session BEFORE INSERT OR UPDATE ON public.v4_sessions
 FOR EACH ROW EXECUTE FUNCTION public.v4_same_day_session_guard();

CREATE OR REPLACE FUNCTION public.v4_same_day_observation_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='UPDATE' AND (OLD.observed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date<>public.v4_school_today() THEN
  RAISE EXCEPTION 'Ghi nhận ngày trước đã khóa, chỉ được xem lại';
 END IF;
 IF (NEW.observed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date<>public.v4_school_today() THEN
  RAISE EXCEPTION 'Không được ghi nhận lùi ngày hoặc trước ngày';
 END IF;
 IF NEW.session_id IS NOT NULL THEN
  IF TG_OP='INSERT' AND NOT public.v4_check_lesson_writable(NEW.session_id) THEN
   RAISE EXCEPTION 'Tiết đã khóa, kết thúc hoặc không thuộc giáo viên này';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.v4_sessions x WHERE x.id=NEW.session_id AND x.lesson_date=public.v4_school_today()) THEN
   RAISE EXCEPTION 'Tiết ngày trước đã khóa, chỉ được xem lại';
  END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS v4_same_day_observation ON public.v4_observations;
CREATE TRIGGER v4_same_day_observation BEFORE INSERT OR UPDATE ON public.v4_observations
 FOR EACH ROW EXECUTE FUNCTION public.v4_same_day_observation_guard();
-- Reads, history and current-day follow-up of an old health alert remain available.

-- SOURCE 13_v6_class_reports.sql
-- V6: read-only class reports. Apply after migration 12.
-- SECURITY INVOKER deliberately preserves the existing health/support RLS.
-- No table policy, write privilege, assessment rule or classification is changed.

CREATE OR REPLACE FUNCTION public.v4_class_report(
 y text,c text,d1 date,d2 date,range_kind text DEFAULT 'week',include_details boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE cls text:=nullif(btrim(c),''); admin_access boolean; home_access boolean;
 detail_count bigint; result jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Cần đăng nhập để xem báo cáo'; END IF;
 IF y IS NULL OR y !~ '^[0-9]{4}-[0-9]{4}$' OR split_part(y,'-',2)::integer<>split_part(y,'-',1)::integer+1 THEN
  RAISE EXCEPTION 'Năm học không hợp lệ';
 END IF;
 IF d1 IS NULL OR d2 IS NULL OR d2<d1 OR d2-d1>369 THEN
  RAISE EXCEPTION 'Khoảng báo cáo phải từ 1 đến 370 ngày';
 END IF;
 IF range_kind IS NULL OR range_kind NOT IN('week','month','semester','custom') OR include_details IS NULL THEN
  RAISE EXCEPTION 'Loại báo cáo không hợp lệ';
 END IF;
 admin_access:=public.v4_admin();
 home_access:=cls IS NOT NULL AND public.v4_actual_homeroom(y,cls);
 IF NOT admin_access AND (cls IS NULL OR NOT public.v4_actual_class_access(y,cls)) THEN
  RAISE EXCEPTION 'Không có quyền xem báo cáo lớp này';
 END IF;
 IF NOT admin_access AND NOT home_access AND range_kind<>'week' THEN
  RAISE EXCEPTION 'Giáo viên bộ môn chỉ xem đánh giá theo tuần';
 END IF;
 IF range_kind='week' AND (d2-d1>6 OR date_trunc('week',d1::timestamp)<>date_trunc('week',d2::timestamp)) THEN
  RAISE EXCEPTION 'Chọn các ngày trong cùng một tuần từ thứ Hai đến Chủ nhật';
 ELSIF range_kind='month' AND date_trunc('month',d1::timestamp)<>date_trunc('month',d2::timestamp) THEN
  RAISE EXCEPTION 'Chọn các ngày trong cùng một tháng';
 ELSIF range_kind='semester' AND d2-d1>219 THEN
  RAISE EXCEPTION 'Khoảng học kỳ tối đa 220 ngày; chọn mốc thực tế của trường';
 ELSIF range_kind='custom' AND NOT admin_access THEN
  RAISE EXCEPTION 'Khoảng tùy chọn chỉ dành cho quản trị';
 END IF;
 -- Never silently truncate an export. Aggregated reports remain available for
 -- a whole school year; request a shorter range/class for very large details.
 IF include_details THEN
  SELECT
   (SELECT count(*) FROM public.v4_attendance a JOIN public.v4_sessions s ON s.id=a.session_id
    WHERE s.school_year=y AND (cls IS NULL OR s.class_code=cls) AND s.lesson_date BETWEEN d1 AND d2)
   +(SELECT count(*) FROM public.v4_observations o LEFT JOIN public.v4_sessions s ON s.id=o.session_id
     WHERE o.school_year=y AND (cls IS NULL OR o.class_code=cls)
      AND coalesce(s.lesson_date,(o.observed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) BETWEEN d1 AND d2)
   +(SELECT count(*) FROM public.v4_support_logs l WHERE l.school_year=y AND (cls IS NULL OR l.class_code=cls)
     AND (l.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN d1 AND d2)
  INTO detail_count;
  IF detail_count>200000 THEN RAISE EXCEPTION 'Báo cáo có hơn 200000 dòng chi tiết. Chọn một lớp hoặc khoảng ngắn hơn, hoặc xem tổng hợp.'; END IF;
 END IF;
 WITH
 roster AS MATERIALIZED (
  SELECT s.id,s.school_year,s.class_code,s.student_code,s.full_name,s.active FROM public.v4_students s
  WHERE s.school_year=y AND (cls IS NULL OR s.class_code=cls)
 ), lessons AS MATERIALIZED (
  SELECT s.id,s.school_year,s.class_code,s.lesson_date,s.period_no,s.subject,s.teacher_id,t.teacher_name,
   coalesce(s.ended_at,CASE WHEN nullif(to_jsonb(s)->>'scheduled_end_at','')::timestamptz<=statement_timestamp()
    THEN nullif(to_jsonb(s)->>'scheduled_end_at','')::timestamptz END) AS ended_at,
   nullif(to_jsonb(s)->>'scheduled_end_at','')::timestamptz AS scheduled_end_at,
   (s.ended_at IS NULL AND coalesce(nullif(to_jsonb(s)->>'scheduled_end_at','')::timestamptz<=statement_timestamp(),false)) AS is_auto_ended
  FROM public.v4_sessions s LEFT JOIN public.v4_teachers t ON t.user_id=s.teacher_id
  WHERE s.school_year=y AND (cls IS NULL OR s.class_code=cls) AND s.lesson_date BETWEEN d1 AND d2
 ), att AS MATERIALIZED (
  SELECT a.session_id,a.student_id,a.status,a.note,a.updated_at FROM public.v4_attendance a JOIN lessons s ON s.id=a.session_id
 ), obs AS MATERIALIZED (
  SELECT o.id,o.student_id,o.school_year,o.class_code,o.session_id,o.observed_at,o.category,o.behavior_code,
   o.activity_context,o.note,o.is_alert,o.attention_kind,o.created_by,t.teacher_name,
   s.lesson_date,s.period_no,s.subject
  FROM public.v4_observations o LEFT JOIN public.v4_sessions s ON s.id=o.session_id
   LEFT JOIN public.v4_teachers t ON t.user_id=o.created_by
  WHERE o.school_year=y AND (cls IS NULL OR o.class_code=cls)
   AND coalesce(s.lesson_date,(o.observed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) BETWEEN d1 AND d2
 ), support AS MATERIALIZED (
  SELECT l.id,l.school_year,l.class_code,l.student_id,l.activity_type,l.content,l.follow_up_on,l.created_at,l.created_by
  FROM public.v4_support_logs l WHERE l.school_year=y AND (cls IS NULL OR l.class_code=cls)
   AND (l.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN d1 AND d2
 ), class_lessons AS (
  SELECT class_code,count(*) AS total_sessions FROM lessons GROUP BY class_code
 ), student_att AS (
  SELECT student_id,count(*) AS confirmed,
   count(*) FILTER(WHERE status='present') AS present,count(*) FILTER(WHERE status='absent') AS absent,
   count(*) FILTER(WHERE status='late') AS late,count(*) FILTER(WHERE status='excused') AS excused
  FROM att GROUP BY student_id
 ), student_obs AS (
  SELECT student_id,count(*) FILTER(WHERE category='positive') AS positive,
   count(*) FILTER(WHERE category='concern') AS concern,count(*) FILTER(WHERE category='health') AS health
  FROM obs GROUP BY student_id
 ), lesson_att AS (
  SELECT session_id,count(*) AS attendance_confirmed,
   count(*) FILTER(WHERE status='present') AS present,count(*) FILTER(WHERE status='absent') AS absent,
   count(*) FILTER(WHERE status='late') AS late,count(*) FILTER(WHERE status='excused') AS excused
  FROM att GROUP BY session_id
 ), lesson_obs AS (
  SELECT session_id,count(*) FILTER(WHERE category='positive') AS positive,
   count(*) FILTER(WHERE category='concern') AS concern,count(*) FILTER(WHERE category='health') AS health
  FROM obs WHERE session_id IS NOT NULL GROUP BY session_id
 ), student_rows AS (
  SELECT s.*,coalesce(l.total_sessions,0) AS total_sessions,coalesce(a.confirmed,0) AS confirmed,
   coalesce(a.present,0) AS present,coalesce(a.absent,0) AS absent,coalesce(a.late,0) AS late,coalesce(a.excused,0) AS excused,
   greatest(coalesce(l.total_sessions,0)-coalesce(a.confirmed,0),0) AS unrecorded,
   coalesce(o.positive,0) AS positive,coalesce(o.concern,0) AS concern,coalesce(o.health,0) AS health
  FROM roster s LEFT JOIN class_lessons l USING(class_code) LEFT JOIN student_att a ON a.student_id=s.id LEFT JOIN student_obs o ON o.student_id=s.id
 ), lesson_rows AS (
  SELECT s.*,coalesce(a.attendance_confirmed,0) AS attendance_confirmed,
   coalesce(a.present,0) AS present,coalesce(a.absent,0) AS absent,coalesce(a.late,0) AS late,coalesce(a.excused,0) AS excused,
   greatest((SELECT count(*) FROM roster r WHERE r.class_code=s.class_code AND r.active)-coalesce(a.attendance_confirmed,0),0) AS unrecorded,
   coalesce(o.positive,0) AS positive,coalesce(o.concern,0) AS concern,coalesce(o.health,0) AS health
  FROM lessons s LEFT JOIN lesson_att a ON a.session_id=s.id LEFT JOIN lesson_obs o ON o.session_id=s.id
 ), class_codes AS (
  SELECT class_code FROM roster UNION SELECT class_code FROM lessons UNION SELECT class_code FROM obs
 )
 SELECT jsonb_build_object(
  'range',jsonb_build_object('school_year',y,'class_code',cls,'start',d1,'end',d2,'kind',range_kind),
  'details_included',include_details,
  'permissions',jsonb_build_object('admin',admin_access,'homeroom',home_access,'aggregate',admin_access OR home_access,
   'health',EXISTS(SELECT 1 FROM public.v4_class_access WHERE user_id=auth.uid() AND school_year=y AND (cls IS NULL OR class_code=cls)),
   'support',EXISTS(SELECT 1 FROM public.v4_class_access WHERE user_id=auth.uid() AND school_year=y AND role='gvcn' AND (cls IS NULL OR class_code=cls))),
  'classes',coalesce((SELECT jsonb_agg(jsonb_build_object('class_code',cc.class_code,
   'students',(SELECT count(*) FROM roster r WHERE r.class_code=cc.class_code AND r.active),
   'sessions',(SELECT count(*) FROM lessons s WHERE s.class_code=cc.class_code)) ORDER BY cc.class_code) FROM class_codes cc),'[]'::jsonb),
  'summary',jsonb_build_object('students',(SELECT count(*) FROM roster WHERE active),'sessions',(SELECT count(*) FROM lessons),
   'attendance_recorded',(SELECT count(*) FROM att),'positive',(SELECT count(*) FROM obs WHERE category='positive'),
   'concern',(SELECT count(*) FROM obs WHERE category='concern'),'health',(SELECT count(*) FROM obs WHERE category='health')),
  'students',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.class_code,r.student_code,r.id) FROM student_rows r),'[]'::jsonb),
  'sessions',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.lesson_date,s.period_no,s.class_code,s.id) FROM lesson_rows s),'[]'::jsonb),
  'attendance',CASE WHEN include_details THEN coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.session_id,a.student_id) FROM att a),'[]'::jsonb) ELSE '[]'::jsonb END,
  'observations',CASE WHEN include_details THEN coalesce((SELECT jsonb_agg(to_jsonb(o) ORDER BY o.observed_at,o.id) FROM obs o),'[]'::jsonb) ELSE '[]'::jsonb END,
  'support_logs',CASE WHEN include_details THEN coalesce((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.created_at,l.id) FROM support l),'[]'::jsonb) ELSE '[]'::jsonb END
 ) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.v4_class_report(text,text,date,date,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.v4_class_report(text,text,date,date,text,boolean) TO authenticated;

-- SOURCE 14_v6_automatic_lesson_end.sql
-- V6: lessons end at their saved timetable clock, without a browser or cron.
-- Automatic ending is a derived server state. It does not write ended_at or
-- confirm attendance; the teacher may complete saved work during the same day.

ALTER TABLE public.v4_sessions ADD COLUMN IF NOT EXISTS scheduled_end_at timestamptz;
DROP TRIGGER IF EXISTS v4_schedule_session ON public.v4_sessions;
-- Backfill only the new field. The table lock taken by ALTER TABLE protects
-- this transaction while its named current-day trigger is temporarily paused.
-- All other identity/ownership triggers and all existing manual closures remain.
ALTER TABLE public.v4_sessions DISABLE TRIGGER v4_same_day_session;
UPDATE public.v4_sessions s SET scheduled_end_at=(s.lesson_date+t.end_time) AT TIME ZONE 'Asia/Ho_Chi_Minh'
 FROM public.v4_lesson_times t WHERE s.period_no=t.period_no AND s.scheduled_end_at IS NULL;
ALTER TABLE public.v4_sessions ENABLE TRIGGER v4_same_day_session;

CREATE OR REPLACE FUNCTION public.v4_schedule_session_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
DECLARE closing_time time;
BEGIN
 IF TG_OP='INSERT' THEN
  SELECT end_time INTO closing_time FROM public.v4_lesson_times WHERE period_no=NEW.period_no;
  IF closing_time IS NULL THEN RAISE EXCEPTION 'Chưa cấu hình giờ kết thúc tiết %. Liên hệ quản trị để bổ sung giờ học.',NEW.period_no; END IF;
  -- Ignore any client-supplied schedule; the trusted clock is copied once.
  NEW.scheduled_end_at:=(NEW.lesson_date+closing_time) AT TIME ZONE 'Asia/Ho_Chi_Minh';
 ELSIF NEW.scheduled_end_at IS DISTINCT FROM OLD.scheduled_end_at THEN
  RAISE EXCEPTION 'Không được sửa giờ kết thúc đã lưu của tiết học';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER v4_schedule_session BEFORE INSERT OR UPDATE ON public.v4_sessions
 FOR EACH ROW EXECUTE FUNCTION public.v4_schedule_session_guard();
REVOKE ALL ON FUNCTION public.v4_schedule_session_guard() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.v4_session_status(sess uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE lesson public.v4_sessions%ROWTYPE; clock_now timestamptz:=statement_timestamp(); automatic boolean; writable boolean;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Cần đăng nhập để xem tiết học'; END IF;
 SELECT * INTO lesson FROM public.v4_sessions WHERE id=sess;
 IF NOT FOUND THEN RAISE EXCEPTION 'Không có quyền xem tiết học hoặc tiết không còn tồn tại'; END IF;
 automatic:=lesson.ended_at IS NULL AND lesson.scheduled_end_at IS NOT NULL AND clock_now>=lesson.scheduled_end_at;
 writable:=public.v4_check_lesson_writable(lesson.id);
 RETURN jsonb_build_object('id',lesson.id,'scheduled_end_at',lesson.scheduled_end_at,
  'ended_at',coalesce(lesson.ended_at,CASE WHEN automatic THEN lesson.scheduled_end_at END),
  'manual_ended_at',lesson.ended_at,'is_auto_ended',automatic,'server_now',clock_now,
  'school_today',public.v4_school_today(),'can_write',writable,'read_only',NOT writable);
END $$;
REVOKE ALL ON FUNCTION public.v4_session_status(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.v4_session_status(uuid) TO authenticated;
COMMENT ON COLUMN public.v4_sessions.scheduled_end_at IS 'Server-saved lesson end in Asia/Ho_Chi_Minh; automatic state does not close same-day writing.';

-- SOURCE 15_v6_report_permissions.sql
-- V6: enforce report aggregation permissions at the RPC boundary.
-- Apply after migration 14. Only the actual homeroom teacher for the selected
-- class and admin receive whole-range summaries/student cumulative counters.
-- Subject teachers retain their permitted weekly per-lesson data and roster.
-- SECURITY INVOKER preserves health/support RLS. No write policy is changed.
-- Enrollment history is not known: do not infer historical missing attendance
-- from today's active roster. total_sessions means lessons opened for the class.

CREATE OR REPLACE FUNCTION public.v4_class_report(
 y text,c text,d1 date,d2 date,range_kind text DEFAULT 'week',include_details boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE cls text:=nullif(btrim(c),''); admin_access boolean; home_access boolean; aggregate_access boolean;
 detail_count bigint; result jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Cần đăng nhập để xem báo cáo'; END IF;
 IF y IS NULL OR y !~ '^[0-9]{4}-[0-9]{4}$' OR split_part(y,'-',2)::integer<>split_part(y,'-',1)::integer+1 THEN
  RAISE EXCEPTION 'Năm học không hợp lệ';
 END IF;
 IF d1 IS NULL OR d2 IS NULL OR d2<d1 OR d2-d1>369 THEN
  RAISE EXCEPTION 'Khoảng báo cáo phải từ 1 đến 370 ngày';
 END IF;
 IF range_kind IS NULL OR range_kind NOT IN('week','month','semester','custom') OR include_details IS NULL THEN
  RAISE EXCEPTION 'Loại báo cáo không hợp lệ';
 END IF;
 admin_access:=public.v4_admin();
 home_access:=cls IS NOT NULL AND public.v4_actual_homeroom(y,cls);
 aggregate_access:=admin_access OR home_access;
 IF NOT admin_access AND (cls IS NULL OR NOT public.v4_actual_class_access(y,cls)) THEN
  RAISE EXCEPTION 'Không có quyền xem báo cáo lớp này';
 END IF;
 IF NOT admin_access AND NOT home_access AND range_kind<>'week' THEN
  RAISE EXCEPTION 'Giáo viên bộ môn chỉ xem đánh giá theo tuần';
 END IF;
 IF range_kind='week' AND (d2-d1>6 OR date_trunc('week',d1::timestamp)<>date_trunc('week',d2::timestamp)) THEN
  RAISE EXCEPTION 'Chọn các ngày trong cùng một tuần từ thứ Hai đến Chủ nhật';
 ELSIF range_kind='month' AND date_trunc('month',d1::timestamp)<>date_trunc('month',d2::timestamp) THEN
  RAISE EXCEPTION 'Chọn các ngày trong cùng một tháng';
 ELSIF range_kind='semester' AND d2-d1>219 THEN
  RAISE EXCEPTION 'Khoảng học kỳ tối đa 220 ngày; chọn mốc thực tế của trường';
 ELSIF range_kind='custom' AND NOT admin_access THEN
  RAISE EXCEPTION 'Khoảng tùy chọn chỉ dành cho quản trị';
 END IF;
 -- Never silently truncate an export. Aggregated reports remain available for
 -- a whole school year; request a shorter range/class for very large details.
 IF include_details THEN
  SELECT
   (SELECT count(*) FROM public.v4_attendance a JOIN public.v4_sessions s ON s.id=a.session_id
    WHERE s.school_year=y AND (cls IS NULL OR s.class_code=cls) AND s.lesson_date BETWEEN d1 AND d2)
   +(SELECT count(*) FROM public.v4_observations o LEFT JOIN public.v4_sessions s ON s.id=o.session_id
     WHERE o.school_year=y AND (cls IS NULL OR o.class_code=cls)
      AND coalesce(s.lesson_date,(o.observed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) BETWEEN d1 AND d2)
   +(SELECT count(*) FROM public.v4_support_logs l WHERE l.school_year=y AND (cls IS NULL OR l.class_code=cls)
     AND (l.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN d1 AND d2)
  INTO detail_count;
  IF detail_count>200000 THEN RAISE EXCEPTION 'Báo cáo có hơn 200000 dòng chi tiết. Chọn một lớp hoặc khoảng ngắn hơn, hoặc xem tổng hợp.'; END IF;
 END IF;
 WITH
 roster AS MATERIALIZED (
  SELECT s.id,s.school_year,s.class_code,s.student_code,s.full_name,s.active FROM public.v4_students s
  WHERE s.school_year=y AND (cls IS NULL OR s.class_code=cls)
 ), lessons AS MATERIALIZED (
  SELECT s.id,s.school_year,s.class_code,s.lesson_date,s.period_no,s.subject,s.teacher_id,t.teacher_name,
   coalesce(s.ended_at,CASE WHEN nullif(to_jsonb(s)->>'scheduled_end_at','')::timestamptz<=statement_timestamp()
    THEN nullif(to_jsonb(s)->>'scheduled_end_at','')::timestamptz END) AS ended_at,
   nullif(to_jsonb(s)->>'scheduled_end_at','')::timestamptz AS scheduled_end_at,
   (s.ended_at IS NULL AND coalesce(nullif(to_jsonb(s)->>'scheduled_end_at','')::timestamptz<=statement_timestamp(),false)) AS is_auto_ended
  FROM public.v4_sessions s LEFT JOIN public.v4_teachers t ON t.user_id=s.teacher_id
  WHERE s.school_year=y AND (cls IS NULL OR s.class_code=cls) AND s.lesson_date BETWEEN d1 AND d2
 ), att AS MATERIALIZED (
  SELECT a.session_id,a.student_id,a.status,a.note,a.updated_at FROM public.v4_attendance a JOIN lessons s ON s.id=a.session_id
 ), obs AS MATERIALIZED (
  SELECT o.id,o.student_id,o.school_year,o.class_code,o.session_id,o.observed_at,o.category,o.behavior_code,
   o.activity_context,o.note,o.is_alert,o.attention_kind,o.created_by,t.teacher_name,
   s.lesson_date,s.period_no,s.subject
  FROM public.v4_observations o LEFT JOIN public.v4_sessions s ON s.id=o.session_id
   LEFT JOIN public.v4_teachers t ON t.user_id=o.created_by
  WHERE o.school_year=y AND (cls IS NULL OR o.class_code=cls)
   AND coalesce(s.lesson_date,(o.observed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) BETWEEN d1 AND d2
 ), support AS MATERIALIZED (
  SELECT l.id,l.school_year,l.class_code,l.student_id,l.activity_type,l.content,l.follow_up_on,l.created_at,l.created_by
  FROM public.v4_support_logs l WHERE l.school_year=y AND (cls IS NULL OR l.class_code=cls)
   AND (l.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN d1 AND d2
 ), class_lessons AS (
  SELECT class_code,count(*) AS total_sessions FROM lessons WHERE aggregate_access GROUP BY class_code
 ), student_att AS (
  SELECT student_id,count(*) AS confirmed,
   count(*) FILTER(WHERE status='present') AS present,count(*) FILTER(WHERE status='absent') AS absent,
   count(*) FILTER(WHERE status='late') AS late,count(*) FILTER(WHERE status='excused') AS excused
  FROM att WHERE aggregate_access GROUP BY student_id
 ), student_obs AS (
  SELECT student_id,count(*) FILTER(WHERE category='positive') AS positive,
   count(*) FILTER(WHERE category='concern') AS concern,count(*) FILTER(WHERE category='health') AS health
  FROM obs WHERE aggregate_access GROUP BY student_id
 ), lesson_att AS (
  SELECT session_id,count(*) AS attendance_confirmed,
   count(*) FILTER(WHERE status='present') AS present,count(*) FILTER(WHERE status='absent') AS absent,
   count(*) FILTER(WHERE status='late') AS late,count(*) FILTER(WHERE status='excused') AS excused
  FROM att GROUP BY session_id
 ), lesson_obs AS (
  SELECT session_id,count(*) FILTER(WHERE category='positive') AS positive,
   count(*) FILTER(WHERE category='concern') AS concern,count(*) FILTER(WHERE category='health') AS health
  FROM obs WHERE session_id IS NOT NULL GROUP BY session_id
 ), student_rows AS (
  SELECT s.*,coalesce(l.total_sessions,0) AS total_sessions,coalesce(a.confirmed,0) AS confirmed,
   coalesce(a.present,0) AS present,coalesce(a.absent,0) AS absent,coalesce(a.late,0) AS late,coalesce(a.excused,0) AS excused,
   NULL::bigint AS unrecorded,
   coalesce(o.positive,0) AS positive,coalesce(o.concern,0) AS concern,coalesce(o.health,0) AS health
  FROM roster s LEFT JOIN class_lessons l USING(class_code) LEFT JOIN student_att a ON a.student_id=s.id LEFT JOIN student_obs o ON o.student_id=s.id
  WHERE aggregate_access
 ), lesson_rows AS (
  SELECT s.*,coalesce(a.attendance_confirmed,0) AS attendance_confirmed,
   coalesce(a.present,0) AS present,coalesce(a.absent,0) AS absent,coalesce(a.late,0) AS late,coalesce(a.excused,0) AS excused,
   NULL::bigint AS unrecorded,
   coalesce(o.positive,0) AS positive,coalesce(o.concern,0) AS concern,coalesce(o.health,0) AS health
  FROM lessons s LEFT JOIN lesson_att a ON a.session_id=s.id LEFT JOIN lesson_obs o ON o.session_id=s.id
 ), class_codes AS (
  SELECT class_code FROM roster UNION SELECT class_code FROM lessons UNION SELECT class_code FROM obs
 )
 SELECT jsonb_build_object(
  'range',jsonb_build_object('school_year',y,'class_code',cls,'start',d1,'end',d2,'kind',range_kind),
  'details_included',include_details,
  'roster_basis','current_roster',
  'attendance_completeness','unknown_membership_history',
  'permissions',jsonb_build_object('admin',admin_access,'homeroom',home_access,'aggregate',aggregate_access,
   'health',EXISTS(SELECT 1 FROM public.v4_class_access WHERE user_id=auth.uid() AND school_year=y AND (cls IS NULL OR class_code=cls)),
   'support',EXISTS(SELECT 1 FROM public.v4_class_access WHERE user_id=auth.uid() AND school_year=y AND role='gvcn' AND (cls IS NULL OR class_code=cls))),
  'classes',coalesce((SELECT jsonb_agg(jsonb_build_object('class_code',cc.class_code)
   || CASE WHEN aggregate_access THEN jsonb_build_object(
    'students',(SELECT count(*) FROM roster r WHERE r.class_code=cc.class_code AND r.active),
    'sessions',(SELECT count(*) FROM lessons s WHERE s.class_code=cc.class_code)) ELSE '{}'::jsonb END
   ORDER BY cc.class_code) FROM class_codes cc),'[]'::jsonb),
  'students',CASE WHEN aggregate_access THEN
   coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.class_code,r.student_code,r.id) FROM student_rows r),'[]'::jsonb)
   ELSE coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.class_code,r.student_code,r.id) FROM roster r),'[]'::jsonb) END,
  'sessions',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.lesson_date,s.period_no,s.class_code,s.id) FROM lesson_rows s),'[]'::jsonb),
  'attendance',CASE WHEN include_details THEN coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.session_id,a.student_id) FROM att a),'[]'::jsonb) ELSE '[]'::jsonb END,
  'observations',CASE WHEN include_details THEN coalesce((SELECT jsonb_agg(to_jsonb(o) ORDER BY o.observed_at,o.id) FROM obs o),'[]'::jsonb) ELSE '[]'::jsonb END,
  'support_logs',CASE WHEN include_details THEN coalesce((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.created_at,l.id) FROM support l),'[]'::jsonb) ELSE '[]'::jsonb END
 ) || CASE WHEN aggregate_access THEN jsonb_build_object(
  'summary',jsonb_build_object('students',(SELECT count(*) FROM roster WHERE active),'sessions',(SELECT count(*) FROM lessons),
   'attendance_recorded',(SELECT count(*) FROM att),'positive',(SELECT count(*) FROM obs WHERE category='positive'),
   'concern',(SELECT count(*) FROM obs WHERE category='concern'),'health',(SELECT count(*) FROM obs WHERE category='health')))
  ELSE '{}'::jsonb END INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.v4_class_report(text,text,date,date,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.v4_class_report(text,text,date,date,text,boolean) TO authenticated;

-- SOURCE 16_v6_school_year_contract.sql
-- Canonical school-year identity. Historical rows are audited, never rewritten.
-- Run after migration 15. The guards apply to new rows / changed identities only.

CREATE OR REPLACE FUNCTION public.v4_school_year_valid(value text) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 SELECT CASE WHEN value ~ '^[0-9]{4}-[0-9]{4}$'
  THEN substring(value,6,4)::integer = substring(value,1,4)::integer + 1
  ELSE false END
$$;

CREATE OR REPLACE FUNCTION public.v4_school_year_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.school_year IS NOT DISTINCT FROM OLD.school_year THEN RETURN NEW; END IF;
 END IF;
 IF NOT public.v4_school_year_valid(NEW.school_year) THEN
  RAISE EXCEPTION 'Năm học không hợp lệ: dùng YYYY-YYYY với hai năm liên tiếp (ví dụ 2026-2027). Bảng: %',TG_TABLE_NAME
   USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;

-- Apply to both legacy timetable/PPCT and student-management tables present now.
DO $$ DECLARE item record;
BEGIN
 FOR item IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  JOIN pg_attribute a ON a.attrelid=c.oid
  WHERE n.nspname='public' AND c.relkind='r' AND a.attname='school_year' AND NOT a.attisdropped
 LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS v4_school_year_identity ON public.%I',item.relname);
  EXECUTE format('CREATE TRIGGER v4_school_year_identity BEFORE INSERT OR UPDATE OF school_year ON public.%I FOR EACH ROW EXECUTE FUNCTION public.v4_school_year_guard()',item.relname);
 END LOOP;
END $$;

-- Existing malformed drafts must not become active, even when school_year is unchanged.
CREATE OR REPLACE FUNCTION public.v4_published_year_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF public.v4_school_year_valid(NEW.school_year) THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' THEN
  -- Deactivating a malformed historical publication must remain possible.
  IF NOT NEW.is_active AND (NEW.status<>'published' OR
    (OLD.status='published' AND NEW.school_year IS NOT DISTINCT FROM OLD.school_year)) THEN RETURN NEW; END IF;
 END IF;
 IF NEW.is_active OR NEW.status='published' THEN
  RAISE EXCEPTION 'Chưa thể công bố: năm học không đúng YYYY-YYYY liên tiếp. Chạy kiểm kê năm học và đối chiếu dữ liệu trước khi sửa bản cũ.'
   USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS v4_published_year ON public.tkb_versions;
CREATE TRIGGER v4_published_year BEFORE INSERT OR UPDATE OF status,is_active,school_year ON public.tkb_versions
 FOR EACH ROW EXECUTE FUNCTION public.v4_published_year_guard();

-- Admin-only read-only inventory: counts and year keys, never student details.
-- canonical_candidate is a suggestion, not a migration or a merge decision.
CREATE OR REPLACE FUNCTION public.v4_school_year_preflight() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE item record; group_row record; inventory jsonb:='[]'; candidate text;
 invalid_rows bigint:=0; invalid_groups integer:=0; variants jsonb;
BEGIN
 IF NOT public.v4_admin() THEN RAISE EXCEPTION 'Chỉ quản trị được kiểm kê năm học'; END IF;
 FOR item IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  JOIN pg_attribute a ON a.attrelid=c.oid
  WHERE n.nspname='public' AND c.relkind='r' AND a.attname='school_year' AND NOT a.attisdropped
  ORDER BY c.relname
 LOOP
  FOR group_row IN EXECUTE format('SELECT school_year,count(*) AS row_count FROM public.%I GROUP BY school_year ORDER BY school_year',item.relname)
  LOOP
   candidate=regexp_replace(btrim(coalesce(group_row.school_year,'')),'[[:space:]]*[–—-][[:space:]]*','-','g');
   IF NOT public.v4_school_year_valid(candidate) THEN candidate=NULL; END IF;
   inventory=inventory||jsonb_build_array(jsonb_build_object('table',item.relname,'school_year',group_row.school_year,
    'row_count',group_row.row_count,'canonical',public.v4_school_year_valid(group_row.school_year),'canonical_candidate',candidate));
   IF NOT public.v4_school_year_valid(group_row.school_year) THEN
    invalid_rows=invalid_rows+group_row.row_count; invalid_groups=invalid_groups+1;
   END IF;
  END LOOP;
 END LOOP;
 SELECT coalesce(jsonb_agg(to_jsonb(v)),'[]') INTO variants FROM (
  SELECT e->>'canonical_candidate' AS canonical_candidate,jsonb_agg(DISTINCT e->'school_year') AS raw_values
  FROM jsonb_array_elements(inventory) e WHERE e->>'canonical_candidate' IS NOT NULL
  GROUP BY e->>'canonical_candidate' HAVING count(DISTINCT e->>'school_year')>1
 ) v;
 RETURN jsonb_build_object('invalid_rows',invalid_rows,'invalid_groups',invalid_groups,
  'inventory',inventory,'variants',variants,'read_only',true);
END $$;
REVOKE ALL ON FUNCTION public.v4_school_year_preflight() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.v4_school_year_preflight() TO authenticated;

-- SOURCE 17_v6_retire_substitute_mode.sql
-- Retire new substitute sessions; preserve migration06 year and teacher verification and all history.

CREATE OR REPLACE FUNCTION public.v4_verify_session() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE tcode text;
BEGIN
 IF NEW.source='day_thay' THEN RAISE EXCEPTION 'Chế độ dạy thay đã ngừng sử dụng. Liên hệ quản trị cập nhật phân công TKB.'; END IF;
 IF NEW.source='tkb' THEN
  IF NEW.timetable_version_id IS NULL THEN RAISE EXCEPTION 'Chưa xác định bản thời khóa biểu'; END IF;
  SELECT teacher_code INTO tcode FROM public.v4_teachers WHERE user_id=NEW.teacher_id;
  IF tcode IS NULL OR NOT EXISTS(
   SELECT 1 FROM public.tkb_entries e JOIN public.tkb_versions v ON v.id=e.version_id
   WHERE e.version_id::text=NEW.timetable_version_id AND v.status='published' AND v.is_active=true
    AND v.school_year=NEW.school_year AND e.teacher_code=tcode AND e.class_code=NEW.class_code
    AND e.period_no=NEW.period_no AND e.day_no=extract(isodow FROM NEW.lesson_date)::integer+1
    AND e.subject=NEW.subject
  ) THEN RAISE EXCEPTION 'Tiết này không khớp TKB/năm học của giáo viên. Liên hệ quản trị cập nhật phân công.'; END IF;
 ELSE
  IF length(btrim(NEW.override_reason))<10 THEN
   RAISE EXCEPTION 'Cần ghi lý do ít nhất 10 ký tự khi chọn thủ công';
  END IF;
 END IF;
 RETURN NEW;
END $$;

-- SOURCE 19_v6_teacher_accounts.sql
-- Teacher profiles and account audit. Auth passwords stay in Supabase Auth only.
-- Apply after17. 18_readiness_preflight.sql is read-only.

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

-- SOURCE 20_v6_weekly_lesson_reviews.sql
-- Apply after19. Current-week view for subject teachers; teacher-authored lesson review.

CREATE TABLE IF NOT EXISTS public.v4_lesson_reviews(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 session_id uuid NOT NULL UNIQUE REFERENCES public.v4_sessions(id) ON DELETE CASCADE,
 school_year text NOT NULL,class_code text NOT NULL,lesson_date date NOT NULL,
 teacher_id uuid NOT NULL REFERENCES auth.users(id),
 note text NOT NULL CHECK(length(btrim(note)) BETWEEN 3 AND 1000),
 confirmed_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
ALTER TABLE public.v4_lesson_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY v4_lesson_review_read ON public.v4_lesson_reviews FOR SELECT TO authenticated USING(
 public.v4_has_class(school_year,class_code) AND
 (public.v4_admin() OR public.v4_actual_homeroom(school_year,class_code) OR
  lesson_date BETWEEN date_trunc('week',public.v4_school_today()::timestamp)::date AND date_trunc('week',public.v4_school_today()::timestamp)::date+6)
);
REVOKE ALL ON public.v4_lesson_reviews FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.v4_lesson_reviews TO authenticated;
CREATE TRIGGER v4_audit_lesson_review BEFORE UPDATE ON public.v4_lesson_reviews FOR EACH ROW EXECUTE FUNCTION public.v4_audit_update();
CREATE OR REPLACE FUNCTION public.v4_save_lesson_review(sess uuid,content text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE lesson public.v4_sessions; saved public.v4_lesson_reviews;
BEGIN
 SELECT * INTO lesson FROM public.v4_sessions WHERE id=sess FOR UPDATE;
 IF NOT FOUND OR NOT public.v4_credentials_ready() OR lesson.teacher_id<>auth.uid() OR NOT public.v4_check_lesson_writable(sess) THEN
  RAISE EXCEPTION 'Chỉ giáo viên của tiết được xác nhận nhận định trong ngày học';
 END IF;
 IF content IS NULL OR length(btrim(content)) NOT BETWEEN 3 AND 1000 THEN RAISE EXCEPTION 'Nhận định cần từ 3 đến 1000 ký tự'; END IF;
 INSERT INTO public.v4_lesson_reviews(session_id,school_year,class_code,lesson_date,teacher_id,note)
 VALUES(lesson.id,lesson.school_year,lesson.class_code,lesson.lesson_date,auth.uid(),btrim(content))
 ON CONFLICT(session_id) DO UPDATE SET note=excluded.note,confirmed_at=statement_timestamp()
 RETURNING * INTO saved;
 RETURN to_jsonb(saved);
END $$;
REVOKE ALL ON FUNCTION public.v4_save_lesson_review(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.v4_save_lesson_review(uuid,text) TO authenticated;
-- The replacement report RPC follows below; underlying tables retain RLS.

CREATE OR REPLACE FUNCTION public.v4_class_report(
 y text,c text,d1 date,d2 date,range_kind text DEFAULT 'week',include_details boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE cls text:=nullif(btrim(c),''); admin_access boolean; home_access boolean; aggregate_access boolean;
 detail_count bigint; result jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Cần đăng nhập để xem báo cáo'; END IF;
 IF y IS NULL OR y !~ '^[0-9]{4}-[0-9]{4}$' OR split_part(y,'-',2)::integer<>split_part(y,'-',1)::integer+1 THEN
  RAISE EXCEPTION 'Năm học không hợp lệ';
 END IF;
 IF d1 IS NULL OR d2 IS NULL OR d2<d1 OR d2-d1>369 THEN
  RAISE EXCEPTION 'Khoảng báo cáo phải từ 1 đến 370 ngày';
 END IF;
 IF range_kind IS NULL OR range_kind NOT IN('week','month','semester','custom') OR include_details IS NULL THEN
  RAISE EXCEPTION 'Loại báo cáo không hợp lệ';
 END IF;
 admin_access:=public.v4_admin();
 home_access:=cls IS NOT NULL AND public.v4_actual_homeroom(y,cls);
 aggregate_access:=admin_access OR home_access;

 IF NOT admin_access AND (cls IS NULL OR NOT public.v4_actual_class_access(y,cls)) THEN
  RAISE EXCEPTION 'Không có quyền xem báo cáo lớp này';
 END IF;
 IF NOT admin_access AND NOT home_access AND range_kind<>'week' THEN
  RAISE EXCEPTION 'Giáo viên bộ môn chỉ xem đánh giá theo tuần';
 END IF;
 IF range_kind='week' AND (d2-d1>6 OR date_trunc('week',d1::timestamp)<>date_trunc('week',d2::timestamp)) THEN
  RAISE EXCEPTION 'Chọn các ngày trong cùng một tuần từ thứ Hai đến Chủ nhật';
 ELSIF range_kind='month' AND date_trunc('month',d1::timestamp)<>date_trunc('month',d2::timestamp) THEN
  RAISE EXCEPTION 'Chọn các ngày trong cùng một tháng';
 ELSIF range_kind='semester' AND d2-d1>219 THEN
  RAISE EXCEPTION 'Khoảng học kỳ tối đa 220 ngày; chọn mốc thực tế của trường';
 ELSIF range_kind='custom' AND NOT admin_access THEN
  RAISE EXCEPTION 'Khoảng tùy chọn chỉ dành cho quản trị';
 END IF;
 IF NOT aggregate_access AND (d1<date_trunc('week',public.v4_school_today()::timestamp)::date OR d2>date_trunc('week',public.v4_school_today()::timestamp)::date+6) THEN
  RAISE EXCEPTION 'Giáo viên bộ môn chỉ xem đánh giá tuần hiện tại';
 END IF;
 -- Never silently truncate an export. Aggregated reports remain available for
 -- a whole school year; request a shorter range/class for very large details.
 IF include_details THEN
  SELECT
   (SELECT count(*) FROM public.v4_attendance a JOIN public.v4_sessions s ON s.id=a.session_id
    WHERE s.school_year=y AND (cls IS NULL OR s.class_code=cls) AND s.lesson_date BETWEEN d1 AND d2)
   +(SELECT count(*) FROM public.v4_observations o LEFT JOIN public.v4_sessions s ON s.id=o.session_id
     WHERE o.school_year=y AND (cls IS NULL OR o.class_code=cls)
      AND coalesce(s.lesson_date,(o.observed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) BETWEEN d1 AND d2)
   +(SELECT count(*) FROM public.v4_support_logs l WHERE l.school_year=y AND (cls IS NULL OR l.class_code=cls)
     AND (l.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN d1 AND d2)
  INTO detail_count;
  IF detail_count>200000 THEN RAISE EXCEPTION 'Báo cáo có hơn 200000 dòng chi tiết. Chọn một lớp hoặc khoảng ngắn hơn, hoặc xem tổng hợp.'; END IF;
 END IF;
 WITH
 roster AS MATERIALIZED (
  SELECT s.id,s.school_year,s.class_code,s.student_code,s.full_name,s.active FROM public.v4_students s
  WHERE s.school_year=y AND (cls IS NULL OR s.class_code=cls)
 ), lessons AS MATERIALIZED (
  SELECT s.id,s.school_year,s.class_code,s.lesson_date,s.period_no,s.subject,s.teacher_id,t.teacher_name,
   coalesce(s.ended_at,CASE WHEN nullif(to_jsonb(s)->>'scheduled_end_at','')::timestamptz<=statement_timestamp()
    THEN nullif(to_jsonb(s)->>'scheduled_end_at','')::timestamptz END) AS ended_at,
   nullif(to_jsonb(s)->>'scheduled_end_at','')::timestamptz AS scheduled_end_at,
   (s.ended_at IS NULL AND coalesce(nullif(to_jsonb(s)->>'scheduled_end_at','')::timestamptz<=statement_timestamp(),false)) AS is_auto_ended
  FROM public.v4_sessions s LEFT JOIN public.v4_teachers t ON t.user_id=s.teacher_id
  WHERE s.school_year=y AND (cls IS NULL OR s.class_code=cls) AND s.lesson_date BETWEEN d1 AND d2
 ), att AS MATERIALIZED (
  SELECT a.session_id,a.student_id,a.status,a.note,a.updated_at FROM public.v4_attendance a JOIN lessons s ON s.id=a.session_id
 ), obs AS MATERIALIZED (
  SELECT o.id,o.student_id,o.school_year,o.class_code,o.session_id,o.observed_at,o.category,o.behavior_code,
   o.activity_context,o.note,o.is_alert,o.attention_kind,o.created_by,t.teacher_name,
   s.lesson_date,s.period_no,s.subject
  FROM public.v4_observations o LEFT JOIN public.v4_sessions s ON s.id=o.session_id
   LEFT JOIN public.v4_teachers t ON t.user_id=o.created_by
  WHERE o.school_year=y AND (cls IS NULL OR o.class_code=cls)
   AND coalesce(s.lesson_date,(o.observed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) BETWEEN d1 AND d2
 ), support AS MATERIALIZED (
  SELECT l.id,l.school_year,l.class_code,l.student_id,l.activity_type,l.content,l.follow_up_on,l.created_at,l.created_by
  FROM public.v4_support_logs l WHERE l.school_year=y AND (cls IS NULL OR l.class_code=cls)
   AND (l.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN d1 AND d2
 ), class_lessons AS (
  SELECT class_code,count(*) AS total_sessions FROM lessons WHERE aggregate_access GROUP BY class_code
 ), student_att AS (
  SELECT student_id,count(*) AS confirmed,
   count(*) FILTER(WHERE status='present') AS present,count(*) FILTER(WHERE status='absent') AS absent,
   count(*) FILTER(WHERE status='late') AS late,count(*) FILTER(WHERE status='excused') AS excused
  FROM att WHERE aggregate_access GROUP BY student_id
 ), student_obs AS (
  SELECT student_id,count(*) FILTER(WHERE category='positive') AS positive,
   count(*) FILTER(WHERE category='concern') AS concern,count(*) FILTER(WHERE category='health') AS health
  FROM obs WHERE aggregate_access GROUP BY student_id
 ), lesson_att AS (
  SELECT session_id,count(*) AS attendance_confirmed,
   count(*) FILTER(WHERE status='present') AS present,count(*) FILTER(WHERE status='absent') AS absent,
   count(*) FILTER(WHERE status='late') AS late,count(*) FILTER(WHERE status='excused') AS excused
  FROM att GROUP BY session_id
 ), lesson_obs AS (
  SELECT session_id,count(*) FILTER(WHERE category='positive') AS positive,
   count(*) FILTER(WHERE category='concern') AS concern,count(*) FILTER(WHERE category='health') AS health
  FROM obs WHERE session_id IS NOT NULL GROUP BY session_id
 ), student_rows AS (
  SELECT s.*,coalesce(l.total_sessions,0) AS total_sessions,coalesce(a.confirmed,0) AS confirmed,
   coalesce(a.present,0) AS present,coalesce(a.absent,0) AS absent,coalesce(a.late,0) AS late,coalesce(a.excused,0) AS excused,
   NULL::bigint AS unrecorded,
   coalesce(o.positive,0) AS positive,coalesce(o.concern,0) AS concern,coalesce(o.health,0) AS health
  FROM roster s LEFT JOIN class_lessons l USING(class_code) LEFT JOIN student_att a ON a.student_id=s.id LEFT JOIN student_obs o ON o.student_id=s.id
  WHERE aggregate_access
 ), lesson_rows AS (
  SELECT s.*,coalesce(a.attendance_confirmed,0) AS attendance_confirmed,
   coalesce(a.present,0) AS present,coalesce(a.absent,0) AS absent,coalesce(a.late,0) AS late,coalesce(a.excused,0) AS excused,
   NULL::bigint AS unrecorded,
   coalesce(o.positive,0) AS positive,coalesce(o.concern,0) AS concern,coalesce(o.health,0) AS health
  FROM lessons s LEFT JOIN lesson_att a ON a.session_id=s.id LEFT JOIN lesson_obs o ON o.session_id=s.id
 ), class_codes AS (
  SELECT class_code FROM roster UNION SELECT class_code FROM lessons UNION SELECT class_code FROM obs
 )
 SELECT jsonb_build_object(
  'range',jsonb_build_object('school_year',y,'class_code',cls,'start',d1,'end',d2,'kind',range_kind),
  'details_included',include_details,
  'lesson_reviews',CASE WHEN include_details THEN coalesce((SELECT jsonb_agg(to_jsonb(r)||jsonb_build_object('teacher_name',t.teacher_name) ORDER BY r.lesson_date,r.session_id) FROM public.v4_lesson_reviews r LEFT JOIN public.v4_teachers t ON t.user_id=r.teacher_id WHERE r.school_year=y AND (cls IS NULL OR r.class_code=cls) AND r.lesson_date BETWEEN d1 AND d2),'[]'::jsonb) ELSE '[]'::jsonb END,
  'roster_basis','current_roster',
  'attendance_completeness','unknown_membership_history',
  'permissions',jsonb_build_object('admin',admin_access,'homeroom',home_access,'aggregate',aggregate_access,'export',aggregate_access,
   'health',EXISTS(SELECT 1 FROM public.v4_class_access WHERE user_id=auth.uid() AND school_year=y AND (cls IS NULL OR class_code=cls)),
   'support',EXISTS(SELECT 1 FROM public.v4_class_access WHERE user_id=auth.uid() AND school_year=y AND role='gvcn' AND (cls IS NULL OR class_code=cls))),
  'classes',coalesce((SELECT jsonb_agg(jsonb_build_object('class_code',cc.class_code)
   || CASE WHEN aggregate_access THEN jsonb_build_object(
    'students',(SELECT count(*) FROM roster r WHERE r.class_code=cc.class_code AND r.active),
    'sessions',(SELECT count(*) FROM lessons s WHERE s.class_code=cc.class_code)) ELSE '{}'::jsonb END
   ORDER BY cc.class_code) FROM class_codes cc),'[]'::jsonb),
  'students',CASE WHEN aggregate_access THEN
   coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.class_code,r.student_code,r.id) FROM student_rows r),'[]'::jsonb)
   ELSE coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.class_code,r.student_code,r.id) FROM roster r),'[]'::jsonb) END,
  'sessions',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.lesson_date,s.period_no,s.class_code,s.id) FROM lesson_rows s),'[]'::jsonb),
  'attendance',CASE WHEN include_details THEN coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.session_id,a.student_id) FROM att a),'[]'::jsonb) ELSE '[]'::jsonb END,
  'observations',CASE WHEN include_details THEN coalesce((SELECT jsonb_agg(to_jsonb(o) ORDER BY o.observed_at,o.id) FROM obs o),'[]'::jsonb) ELSE '[]'::jsonb END,
  'support_logs',CASE WHEN include_details THEN coalesce((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.created_at,l.id) FROM support l),'[]'::jsonb) ELSE '[]'::jsonb END
 ) || CASE WHEN aggregate_access THEN jsonb_build_object(
  'summary',jsonb_build_object('students',(SELECT count(*) FROM roster WHERE active),'sessions',(SELECT count(*) FROM lessons),
   'attendance_recorded',(SELECT count(*) FROM att),'positive',(SELECT count(*) FROM obs WHERE category='positive'),
   'concern',(SELECT count(*) FROM obs WHERE category='concern'),'health',(SELECT count(*) FROM obs WHERE category='health')))
  ELSE '{}'::jsonb END INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.v4_class_report(text,text,date,date,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.v4_class_report(text,text,date,date,text,boolean) TO authenticated;

-- SOURCE 21_v6_daily_handoff.sql
-- Apply after20. Derived daily learning facts and lesson handoff; no learner grade,
-- generated teacher review or historical write. The catalogue seed is idempotent.

INSERT INTO public.v4_behaviors(category,behavior_code,sort_order)
 SELECT 'positive','Xuất sắc',6
 WHERE NOT EXISTS(SELECT 1 FROM public.v4_behaviors WHERE category='positive' AND active AND lower(btrim(behavior_code))='xuất sắc')
 ON CONFLICT(behavior_code) DO NOTHING;
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
 IF NOT admin_access AND NOT home_access AND (d1<date_trunc('week',public.v4_school_today()::timestamp)::date OR d2>date_trunc('week',public.v4_school_today()::timestamp)::date+6) THEN RAISE EXCEPTION 'Giáo viên bộ môn chỉ xem đánh giá tuần hiện tại'; END IF;
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
 ), facts AS(
  SELECT l.*,coalesce(a.confirmed,0) AS confirmed,coalesce(a.present,0) AS present,
   coalesce(a.absent,0) AS absent,coalesce(a.late,0) AS late,coalesce(a.excused,0) AS excused,
   coalesce(o.positive,0) AS positive,coalesce(o.concern,0) AS concern,
   greatest(a.updated_at,o.updated_at) AS facts_updated_at,r.id AS review_id,r.note AS teacher_note,r.confirmed_at
  FROM lessons l LEFT JOIN attendance a ON a.session_id=l.id LEFT JOIN observations o ON o.session_id=l.id
   LEFT JOIN public.v4_lesson_reviews r ON r.session_id=l.id
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',f.id,'session_id',f.id,'school_year',f.school_year,'class_code',f.class_code,'lesson_date',f.lesson_date,
  'period_no',f.period_no,'subject',f.subject,'teacher_id',f.teacher_id,'teacher_name',f.teacher_name,
  'source',CASE WHEN f.review_id IS NOT NULL THEN 'teacher' ELSE 'system' END,
  'source_label',CASE WHEN f.review_id IS NOT NULL THEN 'Giáo viên đã xác nhận' ELSE 'Tổng hợp hệ thống' END,
  'stage',CASE WHEN f.ended_at IS NOT NULL OR f.scheduled_end_at<=statement_timestamp() THEN 'final' WHEN f.scheduled_end_at IS NULL THEN 'unknown' ELSE 'in_progress' END,
  'scheduled_end_at',f.scheduled_end_at,'confirmed_at',f.confirmed_at,'generated_at',statement_timestamp(),
  'facts_updated_at',f.facts_updated_at,'review_id',f.review_id,
  'attendance_confirmed',f.confirmed,'present',f.present,'absent',f.absent,'late',f.late,'excused',f.excused,
  'positive',f.positive,'concern',f.concern,'unrecorded',NULL,'attendance_completeness','recorded_only',
  'note',CASE WHEN f.review_id IS NOT NULL THEN f.teacher_note
   WHEN f.confirmed=0 AND f.positive=0 AND f.concern=0 THEN 'Chưa có dữ liệu điểm danh hoặc nhận xét học sinh được lưu cho tiết này.'
   ELSE concat('Điểm danh đã xác nhận: ',f.confirmed,' lượt; có mặt: ',f.present,'; vắng: ',f.absent,'; muộn: ',f.late,'; có phép: ',f.excused,
    '. Nhận xét đã lưu: ',f.positive,' lượt tích cực, ',f.concern,' lượt cần cải thiện. Chưa xác nhận điểm danh không được suy thành có mặt hoặc vắng.') END
 ) ORDER BY f.lesson_date,f.period_no,f.id),'[]'::jsonb) INTO result FROM facts f;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.v4_daily_learning(y text,c text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE cls text:=nullif(btrim(c),''); school_day date:=public.v4_school_today(); students jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Cần đăng nhập để xem trạng thái trong ngày'; END IF;
 IF NOT public.v4_credentials_ready() THEN RAISE EXCEPTION 'Cần đổi mật khẩu trước khi xem dữ liệu lớp'; END IF;
 IF y IS NULL OR y !~ '^[0-9]{4}-[0-9]{4}$' OR split_part(y,'-',2)::integer<>split_part(y,'-',1)::integer+1 THEN RAISE EXCEPTION 'Năm học không hợp lệ'; END IF;
 IF cls IS NULL OR NOT public.v4_has_class(y,cls) THEN RAISE EXCEPTION 'Không có quyền xem dữ liệu lớp này'; END IF;
 WITH today_observations AS MATERIALIZED(
  SELECT o.id,o.student_id,o.category,o.behavior_code,o.is_alert,o.attention_kind,o.observed_at,
   coalesce((SELECT a.action FROM public.v4_alert_actions a WHERE a.observation_id=o.id ORDER BY a.created_at DESC,a.id DESC LIMIT 1),'monitoring') AS latest_action
  FROM public.v4_observations o LEFT JOIN public.v4_sessions l ON l.id=o.session_id
  WHERE o.school_year=y AND o.class_code=cls AND o.category IN('positive','concern')
   AND coalesce(l.lesson_date,(o.observed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)=school_day
 ), counts AS(
  SELECT student_id,count(*) AS recorded_count,count(*) FILTER(WHERE category='positive') AS positive,
   count(*) FILTER(WHERE category='positive' AND lower(btrim(behavior_code))='xuất sắc') AS outstanding,
   count(*) FILTER(WHERE category='concern') AS concern,
   count(*) FILTER(WHERE category='concern' AND is_alert AND attention_kind='unusual' AND latest_action<>'resolved') AS attention,
   max(observed_at) AS latest_recorded_at
  FROM today_observations GROUP BY student_id
 ), rows AS(
  SELECT s.id AS student_id,coalesce(o.recorded_count,0) AS recorded_count,coalesce(o.positive,0) AS positive,coalesce(o.outstanding,0) AS outstanding,
   coalesce(o.concern,0) AS concern,coalesce(o.attention,0) AS attention,o.latest_recorded_at
  FROM public.v4_students s LEFT JOIN counts o ON o.student_id=s.id
  WHERE s.school_year=y AND s.class_code=cls AND s.active
 )
 SELECT coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object(
  'state',CASE WHEN r.attention>0 THEN 'attention' WHEN r.concern>0 THEN 'noted' WHEN r.outstanding>0 THEN 'outstanding' WHEN r.positive>0 THEN 'highlight' ELSE 'clear' END,
  'label',CASE WHEN r.attention>0 THEN 'Cần chú ý đặc biệt' WHEN r.concern>0 THEN 'Cần lưu ý' WHEN r.outstanding>0 THEN 'Xuất sắc' WHEN r.positive>0 THEN 'Tích cực' ELSE 'Bình thường' END
 ) ORDER BY r.student_id),'[]'::jsonb) INTO students FROM rows r;
 RETURN jsonb_build_object('school_year',y,'class_code',cls,'school_today',school_day,'server_now',statement_timestamp(),
  'scope_note','Màu chỉ dựa trên ghi nhận học tập trong ngày được phép xem, không tự xếp loại học sinh; sức khỏe nằm ở mục lưu ý riêng.',
  'students',students,'lesson_handoffs',public.v4_lesson_handoffs(y,cls,school_day,school_day,'week'));
END $$;
REVOKE ALL ON FUNCTION public.v4_lesson_handoffs(text,text,date,date,text),public.v4_daily_learning(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.v4_lesson_handoffs(text,text,date,date,text),public.v4_daily_learning(text,text) TO authenticated;

-- SOURCE 23_v6_separate_admin_teacher.sql
-- Administrator and teaching accounts are separate, including legacy dual grants.
-- Apply after21. Optional metadata repair22 is independent. Keeps all history/grants.

DO $guard$
BEGIN
 IF to_regprocedure('public.v4_credentials_ready()') IS NULL
 OR to_regprocedure('public.v4_lesson_handoffs(text,text,date,date,text)') IS NULL THEN
  RAISE EXCEPTION 'Can hoan tat module den21 truoc khi tach quyen quan tri/giao vien.';
 END IF;
END $guard$;
CREATE OR REPLACE FUNCTION public.v4_actual_class_access(y text,c text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.v4_credentials_ready() AND NOT public.v4_admin() AND EXISTS(
  SELECT 1 FROM public.v4_class_access WHERE user_id=auth.uid() AND school_year=y AND class_code=c
 )
$$;
CREATE OR REPLACE FUNCTION public.v4_actual_homeroom(y text,c text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.v4_credentials_ready() AND NOT public.v4_admin() AND EXISTS(
  SELECT 1 FROM public.v4_class_access WHERE user_id=auth.uid() AND school_year=y AND class_code=c AND role='gvcn'
 )
$$;
REVOKE ALL ON FUNCTION public.v4_actual_class_access(text,text),public.v4_actual_homeroom(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.v4_actual_class_access(text,text),public.v4_actual_homeroom(text,text) TO authenticated;
NOTIFY pgrst, 'reload schema';

NOTIFY pgrst, 'reload schema';
COMMIT;
