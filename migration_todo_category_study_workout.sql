alter table public.todos drop constraint if exists todos_category_check;
alter table public.todos add constraint todos_category_check check (category in ('personal', 'pilates', 'swim', 'study', 'workout'));
