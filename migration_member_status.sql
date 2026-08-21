alter table public.members drop constraint if exists members_status_check;
alter table public.members add constraint members_status_check check (status in ('active', 'trial', 'withdrawn'));
