alter table public.classes add column member_id uuid references public.members(id);
create index classes_member_id_idx on public.classes (member_id);
