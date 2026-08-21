-- 챌린지필라테스 회원관리 시스템 스키마
-- Supabase 프로젝트의 SQL Editor에 이 파일 전체를 붙여넣고 실행하세요.

create extension if not exists pgcrypto;

-- =========================================================
-- 1. profiles (오너/강사 역할)
-- =========================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'instructor' check (role in ('owner', 'instructor')),
  name text not null,
  phone text,
  created_at timestamptz not null default now()
);

create function public.current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create function public.is_owner()
returns boolean
language sql
stable
as $$
  select public.current_role() = 'owner';
$$;

-- =========================================================
-- 2. members (회원)
-- =========================================================
create table public.members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  memo text,
  created_at timestamptz not null default now()
);

create index members_name_idx on public.members (name);

-- =========================================================
-- 3. session_passes (횟수제 이용권 — 금액 정보 없음, 강사도 조회 가능)
-- =========================================================
create table public.session_passes (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  total_sessions int not null check (total_sessions > 0),
  remaining_sessions int not null check (remaining_sessions >= 0),
  purchased_at date not null default current_date,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index session_passes_member_idx on public.session_passes (member_id);

-- =========================================================
-- 4. payments (매출 원장 — 오너 전용)
-- =========================================================
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  pass_id uuid references public.session_passes(id) on delete set null,
  amount integer not null check (amount >= 0),
  payment_method text not null check (payment_method in ('card', 'cash', 'transfer', 'other')),
  paid_at date not null default current_date,
  created_at timestamptz not null default now()
);

create index payments_paid_at_idx on public.payments (paid_at);

-- =========================================================
-- 5. classes (시간표)
-- =========================================================
create table public.classes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  day_of_week smallint not null check (day_of_week between 0 and 6), -- 0=일요일 ... 6=토요일
  start_time time not null,
  end_time time not null,
  capacity int not null default 8,
  instructor_id uuid references public.profiles(id),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index classes_instructor_idx on public.classes (instructor_id);

-- =========================================================
-- 6. attendance (출석)
-- =========================================================
create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  pass_id uuid not null references public.session_passes(id),
  session_date date not null default current_date,
  checked_at timestamptz not null default now(),
  unique (class_id, member_id, session_date)
);

create index attendance_session_date_idx on public.attendance (session_date);

-- =========================================================
-- 7. 출석 시 잔여횟수 자동 차감 / 취소 시 복구 트리거
-- (security definer로 실행되어 강사가 session_passes에 직접 UPDATE
--  권한이 없어도 출석체크를 통해서만 안전하게 차감됨)
-- =========================================================
create function public.handle_attendance_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining int;
begin
  select remaining_sessions into v_remaining
  from public.session_passes
  where id = new.pass_id
  for update;

  if v_remaining is null then
    raise exception '이용권을 찾을 수 없습니다.';
  end if;

  if v_remaining <= 0 then
    raise exception '잔여횟수가 없는 이용권입니다.';
  end if;

  update public.session_passes
  set remaining_sessions = remaining_sessions - 1
  where id = new.pass_id;

  return new;
end;
$$;

create trigger trg_attendance_insert
after insert on public.attendance
for each row execute function public.handle_attendance_insert();

create function public.handle_attendance_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.session_passes
  set remaining_sessions = remaining_sessions + 1
  where id = old.pass_id;

  return old;
end;
$$;

create trigger trg_attendance_delete
after delete on public.attendance
for each row execute function public.handle_attendance_delete();

-- =========================================================
-- 8. Row Level Security
-- =========================================================
alter table public.profiles enable row level security;
alter table public.members enable row level security;
alter table public.session_passes enable row level security;
alter table public.payments enable row level security;
alter table public.classes enable row level security;
alter table public.attendance enable row level security;

-- ---- profiles ----
-- 본인 행 또는 오너는 전체 조회 가능
create policy profiles_select on public.profiles
  for select using (auth.uid() = id or public.is_owner());

-- 최초 로그인 시 본인 프로필을 instructor로만 생성 가능 (owner 승격은 SQL Editor에서 수동 처리)
create policy profiles_insert_self on public.profiles
  for insert with check (auth.uid() = id and role = 'instructor');

-- 오너는 모든 프로필 수정(역할 변경 포함) 가능
create policy profiles_update_owner on public.profiles
  for update using (public.is_owner()) with check (public.is_owner());

-- 본인은 이름/전화번호 등은 수정 가능하되 role은 그대로 유지해야 함
create policy profiles_update_self on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id and role = 'instructor');

-- ---- members ----
create policy members_select on public.members
  for select using (public.current_role() is not null);

create policy members_owner_write on public.members
  for all using (public.is_owner()) with check (public.is_owner());

-- ---- session_passes ----
create policy session_passes_select on public.session_passes
  for select using (public.current_role() is not null);

create policy session_passes_owner_write on public.session_passes
  for all using (public.is_owner()) with check (public.is_owner());

-- ---- payments (오너 전용, 강사는 정책이 없어 전체 접근 불가) ----
create policy payments_owner_only on public.payments
  for all using (public.is_owner()) with check (public.is_owner());

-- ---- classes ----
create policy classes_select on public.classes
  for select using (public.current_role() is not null);

create policy classes_owner_write on public.classes
  for all using (public.is_owner()) with check (public.is_owner());

-- ---- attendance ----
create policy attendance_select on public.attendance
  for select using (
    public.is_owner()
    or exists (
      select 1 from public.classes c
      where c.id = attendance.class_id and c.instructor_id = auth.uid()
    )
  );

create policy attendance_insert on public.attendance
  for insert with check (
    public.is_owner()
    or exists (
      select 1 from public.classes c
      where c.id = attendance.class_id and c.instructor_id = auth.uid()
    )
  );

create policy attendance_delete on public.attendance
  for delete using (
    public.is_owner()
    or exists (
      select 1 from public.classes c
      where c.id = attendance.class_id and c.instructor_id = auth.uid()
    )
  );

-- =========================================================
-- 9. 최초 오너 지정 (가입 후 1회만 직접 실행)
-- =========================================================
-- login.html로 본인 이메일로 먼저 회원가입한 뒤, 아래 문장의 이메일을 바꿔 실행하세요.
-- update public.profiles set role = 'owner'
--   where id = (select id from auth.users where email = 'YOUR_EMAIL@example.com');
