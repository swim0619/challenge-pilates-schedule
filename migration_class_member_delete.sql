-- 회원 삭제 시 해당 회원이 배정된 시간표(classes)가 있으면 삭제가 막히던 문제 수정.
-- 회원을 삭제해도 시간표 항목은 남기고 담당 회원만 비운다.
alter table public.classes drop constraint classes_member_id_fkey;
alter table public.classes add constraint classes_member_id_fkey
  foreign key (member_id) references public.members(id) on delete set null;
