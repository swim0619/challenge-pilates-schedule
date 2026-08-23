create table public.blog_drafts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  keywords text[] not null default '{}',
  source_topic text,
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_at timestamptz not null default now(),
  published_at timestamptz
);

alter table public.blog_drafts enable row level security;

-- 로그인한 원장/강사는 전체 조회·수정·삭제 가능
create policy blog_drafts_staff_all on public.blog_drafts
  for all using (public.current_role() is not null) with check (public.current_role() is not null);

-- 자동 초안 생성 스케줄 작업은 로그인 세션이 없으므로, anon 키로 '초안' 상태만 insert 허용
create policy blog_drafts_anon_insert on public.blog_drafts
  for insert to anon
  with check (status = 'draft');
