create extension if not exists "pgcrypto";

create table if not exists public.class_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null unique,
  phone_last4 text not null,
  class_group_id uuid references public.class_groups(id) on delete set null,
  join_date date not null default current_date,
  status text not null default 'active' check (status in ('active', 'inactive', 'expired', 'dormant')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_members_phone_last4 on public.members (phone_last4);
create index if not exists idx_members_status on public.members (status);
create index if not exists idx_members_class_group_id on public.members (class_group_id);

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  plan_type text not null check (plan_type in ('monthly', 'daily')),
  monthly_limit integer not null check (monthly_limit >= 0),
  duration_days integer not null check (duration_days > 0),
  price integer not null check (price >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.entitlements (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  plan_id uuid not null references public.plans(id),
  start_date date not null,
  end_date date not null,
  remaining_count integer not null check (remaining_count >= 0),
  status text not null default 'active' check (status in ('active', 'expired', 'used_up', 'cancelled')),
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint entitlements_date_order check (end_date >= start_date)
);

create index if not exists idx_entitlements_member_id on public.entitlements (member_id);
create index if not exists idx_entitlements_status on public.entitlements (status);
create index if not exists idx_entitlements_end_date on public.entitlements (end_date);

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  entitlement_id uuid not null references public.entitlements(id),
  class_group_id uuid references public.class_groups(id) on delete set null,
  checkin_time timestamptz not null default now(),
  attendance_date date generated always as ((checkin_time at time zone 'Asia/Seoul')::date) stored,
  source text not null default 'qr' check (source in ('qr', 'admin')),
  created_at timestamptz not null default now()
);

create index if not exists idx_attendance_member_id on public.attendance (member_id);
create index if not exists idx_attendance_checkin_time on public.attendance (checkin_time desc);
create index if not exists idx_attendance_class_group_date on public.attendance (class_group_id, attendance_date);

create table if not exists public.admin_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'admin' check (role in ('admin', 'staff')),
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_members_updated_at on public.members;
create trigger trg_members_updated_at
before update on public.members
for each row
execute function public.set_updated_at();

drop trigger if exists trg_plans_updated_at on public.plans;
create trigger trg_plans_updated_at
before update on public.plans
for each row
execute function public.set_updated_at();

drop trigger if exists trg_entitlements_updated_at on public.entitlements;
create trigger trg_entitlements_updated_at
before update on public.entitlements
for each row
execute function public.set_updated_at();

create or replace view public.retention_targets as
with last_attendance as (
  select
    m.id as member_id,
    max(a.attendance_date) as last_attendance_date
  from public.members m
  left join public.attendance a on a.member_id = m.id
  group by m.id
),
active_entitlements as (
  select distinct on (e.member_id)
    e.member_id,
    e.id as entitlement_id,
    e.end_date,
    e.remaining_count,
    e.status
  from public.entitlements e
  where e.status = 'active'
  order by e.member_id, e.end_date asc
)
select
  m.id as member_id,
  m.name,
  m.phone,
  m.status as member_status,
  la.last_attendance_date,
  ae.entitlement_id,
  ae.end_date,
  ae.remaining_count,
  case
    when la.last_attendance_date is not null and current_date - la.last_attendance_date >= 14 then 'absent_14'
    when la.last_attendance_date is not null and current_date - la.last_attendance_date >= 10 then 'absent_10'
    when ae.end_date is not null and ae.end_date - current_date <= 3 and ae.end_date - current_date >= 0 then 'expiry_d3'
    when ae.end_date is not null and ae.end_date - current_date <= 7 and ae.end_date - current_date >= 0 then 'expiry_d7'
    else null
  end as retention_reason
from public.members m
left join last_attendance la on la.member_id = m.id
left join active_entitlements ae on ae.member_id = m.id
where
  (
    la.last_attendance_date is not null
    and current_date - la.last_attendance_date >= 10
  )
  or (
    ae.end_date is not null
    and ae.end_date - current_date between 0 and 7
  );

drop function if exists public.check_in_member(uuid, text, timestamptz);

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
    v_attendance_id as attendance_id,
    p_member_id as member_id,
    v_entitlement_id as entitlement_id,
    v_updated_remaining_count as remaining_count,
    v_updated_end_date as end_date;
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

insert into public.class_groups (name, sort_order)
values
  ('성인 오전', 10),
  ('입문반', 20),
  ('오후반', 30),
  ('초등반', 40)
on conflict (name) do nothing;

insert into public.plans (name, plan_type, monthly_limit, duration_days, price)
values
  (U&'\B9E4\C77C\BC18', 'monthly', 20, 30, 210000),
  (U&'\D63C\D569\BC18 (\B808\BCA82 + \B808\BCA81/\C785\BB38\BC18) \C8FC3\D68C', 'monthly', 12, 30, 190000),
  (U&'\B808\BCA81/\C785\BB38\BC18 \C8FC3\D68C', 'monthly', 12, 30, 170000),
  (U&'\B808\BCA82 \C8FC2\D68C', 'monthly', 8, 30, 170000),
  (U&'\D63C\D569\BC18 (\B808\BCA82 + \B808\BCA81/\C785\BB38\BC18) \C8FC2\D68C', 'monthly', 8, 30, 160000),
  (U&'\B808\BCA81/\C785\BB38\BC18 \C8FC2\D68C', 'monthly', 8, 30, 140000),
  (U&'\D1A0\C288\C988(+\D30C\B4DC\B418 \D2B9\AC15) \C8FC1\D68C', 'monthly', 4, 30, 120000),
  (U&'\C77C\C77C \C218\AC15\AD8C', 'daily', 1, 1, 30000)
on conflict (name) do nothing;



