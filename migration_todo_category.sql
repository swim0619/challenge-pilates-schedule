alter table public.todos add column if not exists category text not null default 'personal';
alter table public.todos drop constraint if exists todos_category_check;
alter table public.todos add constraint todos_category_check check (category in ('personal', 'pilates', 'swim'));
