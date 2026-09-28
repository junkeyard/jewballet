begin;

create table if not exists public.class_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.members
  add column if not exists class_group_id uuid references public.class_groups(id) on delete set null;

alter table public.attendance
  add column if not exists class_group_id uuid references public.class_groups(id) on delete set null;

create index if not exists idx_members_class_group_id
  on public.members (class_group_id);

create index if not exists idx_attendance_class_group_date
  on public.attendance (class_group_id, attendance_date);

insert into public.class_groups (name, sort_order)
values
  ('성인 오전', 10),
  ('입문반', 20),
  ('오후반', 30),
  ('초등반', 40)
on conflict (name) do nothing;

-- Existing attendance is classified using the member's current primary group.
update public.attendance as a
set class_group_id = m.class_group_id
from public.members as m
where a.member_id = m.id
  and a.class_group_id is null
  and m.class_group_id is not null;

create or replace function public.check_in_member(p_member_id uuid)
returns table (
  attendance_id uuid,
  member_id uuid,
  entitlement_id uuid,
  remaining_count integer,
  end_date date
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_attendance_id uuid;
  v_class_group_id uuid;
  v_entitlement_id uuid;
  v_effective_checkin_time timestamptz := now();
  v_latest_checkin_time timestamptz;
  v_updated_end_date date;
  v_updated_remaining_count integer;
  v_today date := (v_effective_checkin_time at time zone 'Asia/Seoul')::date;
begin
  perform pg_advisory_xact_lock(hashtext(p_member_id::text)::bigint);

  select m.class_group_id
  into v_class_group_id
  from public.members as m
  where m.id = p_member_id;

  select a.checkin_time
  into v_latest_checkin_time
  from public.attendance as a
  where a.member_id = p_member_id
  order by a.checkin_time desc
  limit 1;

  if v_latest_checkin_time is not null
    and v_effective_checkin_time < v_latest_checkin_time + interval '15 minutes'
  then
    raise exception 'CHECK_IN_COOLDOWN';
  end if;

  if not exists (
    select 1
    from public.entitlements as e
    where e.member_id = p_member_id
  ) then
    raise exception 'CHECK_IN_NO_ENTITLEMENT';
  end if;

  if exists (
    select 1
    from public.entitlements as e
    where e.member_id = p_member_id
      and e.status = 'active'
      and e.end_date < v_today
  ) then
    raise exception 'CHECK_IN_ENTITLEMENT_EXPIRED';
  end if;

  if exists (
    select 1
    from public.entitlements as e
    where e.member_id = p_member_id
      and e.status in ('active', 'used_up')
      and e.start_date <= v_today
      and e.end_date >= v_today
      and e.remaining_count <= 0
  ) then
    raise exception 'CHECK_IN_NO_REMAINING_COUNT';
  end if;

  select e.id
  into v_entitlement_id
  from public.entitlements as e
  where e.member_id = p_member_id
    and e.status = 'active'
    and e.start_date <= v_today
    and e.end_date >= v_today
    and e.remaining_count > 0
  order by e.start_date desc, e.end_date asc
  limit 1
  for update;

  if v_entitlement_id is null then
    raise exception 'CHECK_IN_NO_ENTITLEMENT';
  end if;

  insert into public.attendance as a (
    member_id,
    entitlement_id,
    class_group_id,
    checkin_time,
    source
  )
  values (
    p_member_id,
    v_entitlement_id,
    v_class_group_id,
    v_effective_checkin_time,
    'qr'
  )
  returning a.id into v_attendance_id;

  update public.entitlements as e
  set
    remaining_count = e.remaining_count - 1,
    status = case
      when e.remaining_count - 1 <= 0 then 'used_up'
      else e.status
    end
  where e.id = v_entitlement_id
  returning e.remaining_count, e.end_date
  into v_updated_remaining_count, v_updated_end_date;

  return query
  select
    v_attendance_id,
    p_member_id,
    v_entitlement_id,
    v_updated_remaining_count,
    v_updated_end_date;
end;
$$;

alter table public.class_groups enable row level security;
alter table public.members enable row level security;
alter table public.plans enable row level security;
alter table public.entitlements enable row level security;
alter table public.attendance enable row level security;
alter table public.admin_profiles enable row level security;

revoke all on table public.class_groups from anon, authenticated;
revoke all on table public.members from anon, authenticated;
revoke all on table public.plans from anon, authenticated;
revoke all on table public.entitlements from anon, authenticated;
revoke all on table public.attendance from anon, authenticated;
revoke all on table public.admin_profiles from anon, authenticated;

alter view public.retention_targets set (security_invoker = true);
revoke all on table public.retention_targets from anon, authenticated;

revoke execute on function public.check_in_member(uuid) from public, anon, authenticated;
grant execute on function public.check_in_member(uuid) to service_role;

commit;
