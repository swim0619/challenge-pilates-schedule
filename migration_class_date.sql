alter table public.classes add column class_date date;
create index classes_class_date_idx on public.classes (class_date);
