alter table public.todos add column is_daily boolean not null default false;
alter table public.todos add column done_date date;
