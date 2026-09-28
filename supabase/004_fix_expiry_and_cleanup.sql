-- 004: 재등록 회원 체크인 차단 버그 수정 + 미사용 스키마 정리
-- 실행 대상: 001 + 003이 적용된 기존 운영 Supabase 프로젝트
-- 작성일: 2026-07-22
--
-- 배경:
--   기존 check_in_member()는 "기간이 지났지만 status가 여전히 active인 수강권"이
--   하나라도 있으면, 유효한 새 수강권이 있어도 CHECK_IN_ENTITLEMENT_EXPIRED를 던졌다.
--   수강권 status를 expired로 바꾸는 로직이 어디에도 없었기 때문에,
--   횟수를 다 쓰지 못하고 기간 만료된 회원이 재등록하면 출석이 막힌다.
-- 수정:
--   1) 함수 진입 시 해당 회원의 기간 경과 active 수강권을 expired로 자동 전환
--   2) 유효 수강권 선택을 먼저 하고, 실패 시에만 사유를 진단해 예외 발생
--   3) retention_targets 뷰도 기간 경과 수강권을 제외하도록 수정
--   4) 미사용 admin_profiles 테이블 제거 (관리자 인증은 환경변수 비밀번호 방식 채택)

begin;

-- ── 1. 일회성 정리: 기간이 지난 active 수강권 일괄 expired 처리 ─────────────
update public.entitlements
set status = 'expired'
where status = 'active'
  and end_date < (now() at time zone 'Asia/Seoul')::date;

-- ── 2. check_in_member 재작성 ────────────────────────────────────────────────
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

  if not found then
    raise exception 'CHECK_IN_MEMBER_NOT_FOUND';
  end if;

  -- 15분 쿨다운
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

  -- ★ 핵심 수정: 기간 경과 active 수강권을 먼저 expired로 정리
  update public.entitlements as e
  set status = 'expired'
  where e.member_id = p_member_id
    and e.status = 'active'
    and e.end_date < v_today;

  -- 유효 수강권 선택 (만료 임박한 것부터 소진)
  select e.id
  into v_entitlement_id
  from public.entitlements as e
  where e.member_id = p_member_id
    and e.status = 'active'
    and e.start_date <= v_today
    and e.end_date >= v_today
    and e.remaining_count > 0
  order by e.end_date asc, e.start_date desc
  limit 1
  for update;

  -- 유효 수강권이 없을 때만 사유 진단 (구체적 사유 → 일반 사유 순)
  if v_entitlement_id is null then
    if not exists (
      select 1 from public.entitlements as e where e.member_id = p_member_id
    ) then
      raise exception 'CHECK_IN_NO_ENTITLEMENT';
    elsif exists (
      select 1 from public.entitlements as e
      where e.member_id = p_member_id
        and e.status in ('active', 'used_up')
        and e.start_date <= v_today
        and e.end_date >= v_today
        and e.remaining_count <= 0
    ) then
      raise exception 'CHECK_IN_NO_REMAINING_COUNT';
    elsif exists (
      select 1 from public.entitlements as e
      where e.member_id = p_member_id
        and e.status = 'active'
        and e.start_date > v_today
    ) then
      raise exception 'CHECK_IN_NOT_STARTED';
    elsif exists (
      select 1 from public.entitlements as e
      where e.member_id = p_member_id
        and (e.status = 'expired' or e.end_date < v_today)
    ) then
      raise exception 'CHECK_IN_ENTITLEMENT_EXPIRED';
    else
      raise exception 'CHECK_IN_NO_ENTITLEMENT';
    end if;
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

revoke execute on function public.check_in_member(uuid) from public, anon, authenticated;
grant execute on function public.check_in_member(uuid) to service_role;

-- ── 3. retention_targets 뷰: 기간 경과 수강권 제외 ──────────────────────────
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
    and e.end_date >= current_date
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

alter view public.retention_targets set (security_invoker = true);
revoke all on table public.retention_targets from anon, authenticated;

-- ── 4. 미사용 테이블 제거 ───────────────────────────────────────────────────
drop table if exists public.admin_profiles;

commit;
