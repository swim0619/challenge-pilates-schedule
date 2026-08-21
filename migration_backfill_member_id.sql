update public.classes c
set member_id = m.id
from public.members m
where c.member_id is null
  and c.title = m.name;
