-- 체험수업(classes.is_trial)은 무료: 출석해도 이용권 횟수를 차감하지 않는다.
-- 체험수업은 이용권이 없는 상태에서도 출석 체크할 수 있어야 하므로 pass_id 를 nullable 로 변경.
alter table public.attendance alter column pass_id drop not null;

create or replace function public.handle_attendance_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining int;
begin
  if exists (select 1 from public.classes where id = new.class_id and is_trial) then
    return new;
  end if;

  select remaining_sessions into v_remaining
  from public.session_passes
  where id = new.pass_id
  for update;

  if v_remaining is null then
    raise exception '이용권을 찾을 수 없습니다.';
  end if;

  if v_remaining <= 0 then
    raise exception '잔여횟수가 없는 이용권입니다.';
  end if;

  update public.session_passes
  set remaining_sessions = remaining_sessions - 1
  where id = new.pass_id;

  return new;
end;
$$;

create or replace function public.handle_attendance_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.pass_id is null or exists (select 1 from public.classes where id = old.class_id and is_trial) then
    return old;
  end if;

  update public.session_passes
  set remaining_sessions = remaining_sessions + 1
  where id = old.pass_id;

  return old;
end;
$$;

-- 이미 출석한 수업에 나중에 '체험수업'을 체크/해제하면 이용권 횟수를 맞춰준다.
create or replace function public.handle_class_trial_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pass uuid;
begin
  if new.is_trial is distinct from old.is_trial then
    select pass_id into v_pass from public.attendance where class_id = new.id and pass_id is not null limit 1;
    if v_pass is not null then
      update public.session_passes
      set remaining_sessions = greatest(remaining_sessions + case when new.is_trial then 1 else -1 end, 0)
      where id = v_pass;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_class_trial_change on public.classes;
create trigger trg_class_trial_change
after update of is_trial on public.classes
for each row execute function public.handle_class_trial_change();
