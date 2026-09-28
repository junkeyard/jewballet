-- 로컬 테스트 DB 전용 가짜 데모 데이터. 실제 Supabase에서 실행하지 않는다.
-- 이름·전화번호는 전부 지어낸 값이다(010-0000-xxxx 대역). 요금제는 예시이며 실운영 값이 아니다.
-- 쓰는 곳: `node test-db/start.mjs --seed`로 띄운 뒤 `npm run dev`로 화면을 눈으로 볼 때.
-- E2E 테스트는 이 파일을 쓰지 않고 테스트마다 필요한 데이터를 직접 만든다(e2e/support/db.ts).

begin;

delete from public.checkin_requests;
delete from public.attendance;
delete from public.entitlements;
delete from public.members;
delete from public.plans;
delete from public.class_groups;

insert into public.class_groups (name, sort_order) values
  ('예시 오전반', 10),
  ('예시 저녁반', 20);

insert into public.plans (name, plan_type, monthly_limit, duration_days, price) values
  ('예시 요금제 주2회', 'monthly', 8, 30, 100000),
  ('예시 요금제 주3회', 'monthly', 12, 30, 130000),
  ('예시 일일권', 'daily', 1, 1, 20000);

with kst as (select (now() at time zone 'Asia/Seoul')::date as today)
insert into public.members (name, phone, phone_last4, class_group_id, join_date, notes)
select v.name, v.phone, right(v.phone, 4),
       (select id from public.class_groups where name = v.grp),
       kst.today - v.joined, '가짜 데모 데이터'
from kst, (values
  ('가상회원 하나', '01000000001', '예시 오전반', 90),
  ('가상회원 둘',   '01000001001', '예시 저녁반', 60),  -- 뒤 4자리 1001 중복 쌍
  ('가상회원 셋',   '01000011001', '예시 오전반', 30),
  ('가상회원 넷',   '01000000004', '예시 저녁반', 120), -- 만료
  ('가상회원 다섯', '01000000005', '예시 오전반', 45),  -- 잔여 0
  ('가상회원 여섯', '01000000006', null,          10)   -- 수강권 없음
) as v(name, phone, grp, joined);

with kst as (select (now() at time zone 'Asia/Seoul')::date as today)
insert into public.entitlements (member_id, plan_id, start_date, end_date, remaining_count, status)
select m.id, p.id, kst.today + v.start_off, kst.today + v.end_off, v.remaining, v.status
from kst, (values
  ('01000000001', '예시 요금제 주3회', -10, 19, 9, 'active'),
  ('01000001001', '예시 요금제 주2회',  -3, 26, 7, 'active'),
  ('01000011001', '예시 요금제 주2회', -25,  4, 2, 'active'),
  ('01000000004', '예시 요금제 주2회', -40,-11, 3, 'active'),  -- 기간 경과(체크인 시 expired로 전환)
  ('01000000005', '예시 요금제 주2회', -20,  9, 0, 'used_up')
) as v(phone, plan, start_off, end_off, remaining, status)
join public.members m on m.phone = v.phone
join public.plans p on p.name = v.plan;

-- 출석 몇 건 (정오 KST로 박아 날짜 경계를 피한다)
insert into public.attendance (member_id, entitlement_id, class_group_id, checkin_time, source)
select m.id, e.id, m.class_group_id,
       (((now() at time zone 'Asia/Seoul')::date - d) + time '12:00') at time zone 'Asia/Seoul',
       'qr'
from public.members m
join public.entitlements e on e.member_id = m.id
cross join (values (1), (3), (6)) as days(d)
where m.phone in ('01000000001', '01000011001');

commit;
