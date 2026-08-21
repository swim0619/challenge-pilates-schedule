create table public.todos (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  done boolean not null default false,
  todo_date date not null default current_date,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index todos_date_idx on public.todos (todo_date);

alter table public.todos enable row level security;

create policy todos_all on public.todos
  for all using (public.current_role() is not null) with check (public.current_role() is not null);
