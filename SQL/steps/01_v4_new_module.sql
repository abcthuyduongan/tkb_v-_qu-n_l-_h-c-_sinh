-- V4 bổ sung. KHÔNG DROP/ALTER bất kỳ bảng TKB nào.
-- Chạy trong SQL Editor Supabase sau khi sao lưu; xem docs/TRIEN_KHAI.md.
begin;
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

commit;
