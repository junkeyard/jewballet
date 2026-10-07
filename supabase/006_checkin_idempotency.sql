-- 006: 체크인 멱등성 — 짧은 시간 안의 재스캔·재전송이 횟수를 두 번 깎지 않게
-- 의존 순서: 001 → 003 → 004 → 005 → 006  (003·004·005 적용을 전제로 한다)
-- 작성일: 2026-09-28
-- 성격: 추가형. 기존 테이블·함수·데이터를 바꾸거나 지우지 않는다.
--       새 테이블 1개(checkin_requests)와 새 함수 1개(check_in_member_once)만 만든다.
--
-- 배경:
--   004의 check_in_member()는 같은 회원의 마지막 출석이 15분 안이면 CHECK_IN_COOLDOWN을 던져
--   이중 차감을 막는다(회원별 advisory lock 안에서 확인하므로 동시 요청도 안전하다).
--   남은 틈은 두 가지다.
--     1) 폰 네트워크가 흔들려 "응답만 못 받은" 요청을 회원이 다시 누르면,
--        첫 요청은 이미 차감됐는데 두 번째는 "잠시 후 다시 시도" 안내를 받는다.
--        회원 입장에서는 출석이 됐는지 알 수 없다.
--     2) 요청 단위 식별자가 없어 같은 요청의 재전송과 새 요청을 구분하지 못한다.
-- 해결:
--   check_in_member_once(회원, 요청ID)는
--     · 같은 요청ID가 이미 처리됐으면 → 그때 결과를 그대로 돌려준다(차감 없음, replayed = true)
--     · 15분 안에 이미 출석했으면       → 그 출석을 돌려준다(차감 없음, replayed = true)
--     · 아니면                          → 기존 check_in_member()로 1회 차감한다(replayed = false)
--   차감 규칙·오류코드·수강권 선택 순서는 전부 004의 check_in_member()를 그대로 쓴다.
--   15분은 004의 쿨다운과 같은 값이다. 둘을 다르게 두면 그 사이 구간에서 COOLDOWN 오류가 난다.
--
-- 앱 적용: 이 파일은 앱이 아직 호출하지 않는다(현재 화면 동작 유지). 회원 화면 작업에서
--   checkIn 액션을 rpc("check_in_member_once", { p_member_id, p_request_id })로 바꾸고,
--   replayed = true면 "이미 출석되어 있습니다" 계열 안내로 보여준다.

begin;

-- ── 1. 요청 기록 ─────────────────────────────────────────────────────────────
-- 브라우저가 체크인 버튼을 누를 때 만든 UUID를 저장한다. 같은 UUID가 다시 오면 재전송이다.
create table if not exists public.checkin_requests (
  request_id uuid primary key,
  member_id uuid not null references public.members(id) on delete cascade,
  attendance_id uuid references public.attendance(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_checkin_requests_member_created
  on public.checkin_requests (member_id, created_at desc);

alter table public.checkin_requests enable row level security;
revoke all on table public.checkin_requests from anon, authenticated;

-- ── 2. 멱등 체크인 함수 ──────────────────────────────────────────────────────
create or replace function public.check_in_member_once(
  p_member_id uuid,
  p_request_id uuid default null
)
returns table (
  attendance_id uuid,
  member_id uuid,
  entitlement_id uuid,
  remaining_count integer,
  end_date date,
  replayed boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := now();
  v_attendance_id uuid;
  v_entitlement_id uuid;
  v_remaining integer;
  v_end_date date;
begin
  -- check_in_member()와 같은 잠금 키. 같은 트랜잭션 안에서는 다시 잡아도 막히지 않는다.
  perform pg_advisory_xact_lock(hashtext(p_member_id::text)::bigint);

  -- (1) 같은 요청의 재전송: 처리됐던 출석을 그대로 돌려준다.
  if p_request_id is not null then
    select r.attendance_id
    into v_attendance_id
    from public.checkin_requests as r
    where r.request_id = p_request_id
      and r.member_id = p_member_id;

    if v_attendance_id is not null then
      select a.entitlement_id, e.remaining_count, e.end_date
      into v_entitlement_id, v_remaining, v_end_date
      from public.attendance as a
      join public.entitlements as e on e.id = a.entitlement_id
      where a.id = v_attendance_id;

      if found then
        return query
        select v_attendance_id, p_member_id, v_entitlement_id, v_remaining, v_end_date, true;
        return;
      end if;
    end if;
  end if;

  -- (2) 15분 안의 재스캔: 방금 한 출석을 돌려준다. (004 쿨다운과 같은 창)
  select a.id, a.entitlement_id, e.remaining_count, e.end_date
  into v_attendance_id, v_entitlement_id, v_remaining, v_end_date
  from public.attendance as a
  join public.entitlements as e on e.id = a.entitlement_id
  where a.member_id = p_member_id
    and a.checkin_time > v_now - interval '15 minutes'
  order by a.checkin_time desc
  limit 1;

  if v_attendance_id is not null then
    if p_request_id is not null then
      insert into public.checkin_requests as r (request_id, member_id, attendance_id)
      values (p_request_id, p_member_id, v_attendance_id)
      on conflict (request_id) do nothing;
    end if;

    return query
    select v_attendance_id, p_member_id, v_entitlement_id, v_remaining, v_end_date, true;
    return;
  end if;

  -- (3) 새 출석: 차감·검증·오류코드는 기존 함수에 맡긴다.
  select c.attendance_id, c.entitlement_id, c.remaining_count, c.end_date
  into v_attendance_id, v_entitlement_id, v_remaining, v_end_date
  from public.check_in_member(p_member_id) as c;

  if p_request_id is not null then
    insert into public.checkin_requests as r (request_id, member_id, attendance_id)
    values (p_request_id, p_member_id, v_attendance_id)
    on conflict (request_id) do update set attendance_id = excluded.attendance_id;
  end if;

  return query
  select v_attendance_id, p_member_id, v_entitlement_id, v_remaining, v_end_date, false;
end;
$$;

revoke execute on function public.check_in_member_once(uuid, uuid) from public, anon, authenticated;
grant execute on function public.check_in_member_once(uuid, uuid) to service_role;

commit;
