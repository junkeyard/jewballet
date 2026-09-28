-- 005: 관리자 수동 출석 등록 · 출석 취소를 RPC로 원자화
-- 실행 대상: 001 + 003 + 004가 적용된 Supabase 프로젝트
-- 작성일: 2026-07-22
--
-- 배경:
--   v2 관리자 화면에 "수동 출석 등록"과 "출석 취소"가 새로 들어간다.
--   앱에서 attendance insert와 entitlements 횟수 갱신을 따로 하면
--   둘 사이에서 실패했을 때 횟수와 출석 기록이 어긋난다.
--   check_in_member()와 같은 방식으로 한 트랜잭션·한 잠금 안에서 처리한다.

begin;

-- ── 1. 관리자 수동 출석 등록 ────────────────────────────────────────────────
-- QR 체크인과 다른 점:
--   · 날짜를 지정할 수 있다(지난 수업 소급 입력). 시각은 해당일 정오(KST)로 박는다.
--   · 15분 쿨다운을 적용하지 않는다. 대신 같은 날 중복만 막는다.
--   · source = 'admin'으로 남겨 QR 출석과 구분한다.
create or replace function public.admin_add_attendance(
  p_member_id uuid,
  p_date date default null
)
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
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_target_date date := coalesce(p_date, v_today);
  v_checkin_time timestamptz;
  v_updated_end_date date;
  v_updated_remaining_count integer;
begin
  perform pg_advisory_xact_lock(hashtext(p_member_id::text)::bigint);

  if v_target_date > v_today then
    raise exception 'ATTENDANCE_FUTURE_DATE';
  end if;

  select m.class_group_id
  into v_class_group_id
  from public.members as m
  where m.id = p_member_id;

  if not found then
    raise exception 'CHECK_IN_MEMBER_NOT_FOUND';
  end if;

  -- 지정일 정오(KST)를 출석 시각으로 삼는다.
  -- attendance_date가 checkin_time에서 생성되므로 자정 경계에 안전한 값이어야 한다.
  v_checkin_time := (v_target_date + time '12:00') at time zone 'Asia/Seoul';

  if exists (
    select 1
    from public.attendance as a
    where a.member_id = p_member_id
      and a.attendance_date = v_target_date
  ) then
    raise exception 'ATTENDANCE_DUPLICATE_DATE';
  end if;

  -- 기간 경과 active 수강권 정리 (004와 같은 처리)
  update public.entitlements as e
  set status = 'expired'
  where e.member_id = p_member_id
    and e.status = 'active'
    and e.end_date < v_today;

  -- 출석일이 기간에 들어가는 수강권을 고른다 (오늘이 아니라 대상일 기준)
  select e.id
  into v_entitlement_id
  from public.entitlements as e
  where e.member_id = p_member_id
    and e.status = 'active'
    and e.start_date <= v_target_date
    and e.end_date >= v_target_date
    and e.remaining_count > 0
  order by e.end_date asc, e.start_date desc
  limit 1
  for update;

  if v_entitlement_id is null then
    if not exists (
      select 1 from public.entitlements as e where e.member_id = p_member_id
    ) then
      raise exception 'CHECK_IN_NO_ENTITLEMENT';
    elsif exists (
      select 1 from public.entitlements as e
      where e.member_id = p_member_id
        and e.status in ('active', 'used_up')
        and e.start_date <= v_target_date
        and e.end_date >= v_target_date
        and e.remaining_count <= 0
    ) then
      raise exception 'CHECK_IN_NO_REMAINING_COUNT';
    else
      raise exception 'CHECK_IN_ENTITLEMENT_EXPIRED';
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
    v_checkin_time,
    'admin'
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

-- ── 2. 출석 취소 + 횟수 복구 ────────────────────────────────────────────────
-- 출석을 지우면 차감했던 1회를 되돌린다.
-- used_up으로 닫혔던 수강권은 기간이 남아 있으면 active로 되살린다.
-- 취소·만료 상태는 건드리지 않는다(운영자가 의도적으로 닫은 것이므로).
create or replace function public.admin_cancel_attendance(p_attendance_id uuid)
returns table (
  member_id uuid,
  entitlement_id uuid,
  remaining_count integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_member_id uuid;
  v_entitlement_id uuid;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_updated_remaining_count integer;
begin
  select a.member_id, a.entitlement_id
  into v_member_id, v_entitlement_id
  from public.attendance as a
  where a.id = p_attendance_id;

  if not found then
    raise exception 'ATTENDANCE_NOT_FOUND';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_member_id::text)::bigint);

  delete from public.attendance as a where a.id = p_attendance_id;

  update public.entitlements as e
  set
    remaining_count = e.remaining_count + 1,
    status = case
      when e.status = 'used_up' and e.end_date >= v_today then 'active'
      else e.status
    end
  where e.id = v_entitlement_id
  returning e.remaining_count into v_updated_remaining_count;

  return query
  select v_member_id, v_entitlement_id, v_updated_remaining_count;
end;
$$;

-- ── 3. 권한 ─────────────────────────────────────────────────────────────────
revoke execute on function public.admin_add_attendance(uuid, date) from public, anon, authenticated;
grant execute on function public.admin_add_attendance(uuid, date) to service_role;

revoke execute on function public.admin_cancel_attendance(uuid) from public, anon, authenticated;
grant execute on function public.admin_cancel_attendance(uuid) to service_role;

commit;
