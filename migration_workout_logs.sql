create table public.workout_logs (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  log_date date not null default current_date,
  content text not null,
  pain_level smallint check (pain_level between 0 and 5),
  created_at timestamptz not null default now()
);

create index workout_logs_member_id_idx on public.workout_logs (member_id);

alter table public.workout_logs enable row level security;

create policy workout_logs_select on public.workout_logs
  for select using (public.current_role() is not null);

create policy workout_logs_write on public.workout_logs
  for all using (public.current_role() is not null) with check (public.current_role() is not null);
