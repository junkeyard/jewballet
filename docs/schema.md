# DB 스키마 (001 → 003 → 004 → 005 → 006 적용 상태 기준)

> 작성 2026-09-28. **아직 실제 DB에 이 상태로 적용되지 않았다.** 07-22 실측으로는 001만 적용됐고 003·004·005는 미적용이다
> (`docs/v2-design.md` "Supabase 실측 상태"). 이 문서는 사람이 003 → 004 → 005 → 006을 순서대로 적용한 **뒤의 모습**을 적는다.
> 이 상태는 로컬 테스트 DB(`app/test-db/start.mjs`)에서 같은 순서로 SQL을 적용해 확인했다. 실제 Supabase에는 적용하지 않았다.

## 1. 마이그레이션 순서와 역할

| 파일 | 한 줄 요약 | 실행 |
|---|---|---|
| `001_init_schema.sql` | 기본 테이블 5개 · `retention_targets` 뷰 · `check_in_member()` 최초판 · RLS 잠금 · 예시 요금제·반 seed | 이미 적용됨. **다시 실행하지 않는다**(예전 요금제 seed가 되살아남) |
| `002_replace_plans.sql` | 요금제를 전부 지우고 다시 넣음 | **실행 금지**(`delete from plans`) |
| `003_class_groups_monthly_attendance.sql` | `class_groups` 테이블, `members`·`attendance`에 `class_group_id` 추가 | 적용 필요 ① |
| `004_fix_expiry_and_cleanup.sql` | 재등록 회원 체크인이 막히는 버그 수정, `retention_targets` 수정, `admin_profiles` 제거 | 적용 필요 ② |
| `005_admin_attendance_rpc.sql` | `admin_add_attendance()`, `admin_cancel_attendance()` | 적용 필요 ③ |
| `006_checkin_idempotency.sql` | `checkin_requests` 테이블, `check_in_member_once()` (추가형, 기존 것 변경 없음) | 적용 필요 ④ (앱은 아직 안 씀) |

순서가 중요하다. 003이 `admin_profiles`에 RLS를 거는데 004가 그 테이블을 지운다. 006은 004의 `check_in_member()`를 안에서 부른다.

## 2. 테이블

모든 테이블은 RLS가 켜져 있고 `anon`·`authenticated`에게서 권한이 회수돼 있다. 앱은 서버에서 **service role 키로만** 접근한다.

### `class_groups` — 반 (003)
| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | uuid PK | |
| name | text | unique |
| sort_order | int | 기본 0 |
| is_active | bool | 기본 true. 반은 지우지 않고 비활성화한다(과거 출석이 참조) |
| created_at | timestamptz | |

### `members` — 회원 (001, `class_group_id`는 003)
| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | uuid PK | `/member?id=`에 그대로 쓰인다 |
| name | text | |
| phone | text | **unique**. 숫자만 저장(`010` + 8자리, 하이픈 없음) |
| phone_last4 | text | 체크인 검색 키. 인덱스 있음. **unique 아님**(뒤 4자리 중복 가능) |
| class_group_id | uuid → class_groups | on delete set null |
| join_date | date | 기본 오늘 |
| status | text | `active` · `inactive` · `expired` · `dormant`. 체크인 검색은 `active`만 |
| notes | text | |
| created_at, updated_at | timestamptz | updated_at은 트리거로 갱신 |

### `plans` — 요금제(상품) (001)
| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | uuid PK | |
| name | text | unique |
| plan_type | text | `monthly` · `daily` |
| monthly_limit | int | 부여 시 기본 횟수 |
| duration_days | int | 부여 시 기본 기간(시작일 포함 N일) |
| price | int | 원 |
| is_active | bool | 판매 중 여부 |
| created_at, updated_at | timestamptz | |

> 요금제 **데이터**는 예시일 뿐이다(브리프 4절). 이름·가격·횟수는 코드에 박지 않고 관리자 "상품" 탭에서 바꾼다.
> 주당 횟수 한도·홀딩 일수·체험권 여부 같은 속성은 아직 컬럼이 없다 → 필요해지면 007 이후 추가형으로.

### `entitlements` — 회원이 가진 수강권 (001)
| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | uuid PK | |
| member_id | uuid → members | on delete cascade |
| plan_id | uuid → plans | |
| start_date, end_date | date | `end_date >= start_date` 제약. 둘 다 KST 날짜 |
| remaining_count | int | `>= 0` 제약 |
| status | text | `active` · `expired` · `used_up` · `cancelled` |
| memo | text | |
| created_at, updated_at | timestamptz | |

상태가 바뀌는 곳:
- `active → used_up`: 체크인·수동 출석으로 남은 횟수가 0이 될 때
- `used_up → active`: 출석 취소로 횟수가 돌아오고 기간이 남아 있을 때(005)
- `active → expired`: 체크인·수동 출석 호출 때 기간이 지난 것을 정리(004). **단, 그 호출이 오류로 끝나면 정리도 같이 되돌려진다**(한 트랜잭션)
- `→ cancelled`: 관리자 "취소"

### `attendance` — 출석 (001, `class_group_id`는 003)
| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | uuid PK | |
| member_id | uuid → members | on delete cascade |
| entitlement_id | uuid → entitlements | 어느 수강권에서 차감했는지 |
| class_group_id | uuid → class_groups | 출석 당시 회원의 소속반 |
| checkin_time | timestamptz | |
| attendance_date | date | **생성 컬럼** = `checkin_time`의 Asia/Seoul 날짜 |
| source | text | `qr` · `admin` |
| created_at | timestamptz | |

### `checkin_requests` — 체크인 요청 기록 (006, 신규)
| 컬럼 | 타입 | 비고 |
|---|---|---|
| request_id | uuid PK | 브라우저가 체크인 버튼을 누를 때 만드는 값 |
| member_id | uuid → members | on delete cascade |
| attendance_id | uuid → attendance | on delete set null (출석 취소 시 비워짐) |
| created_at | timestamptz | |

## 3. 뷰

### `retention_targets` (004판)
연락이 필요한 회원. `security_invoker = true`, anon/authenticated 권한 없음.
- 사유(`retention_reason`): `absent_14`(14일+ 미출석) > `absent_10` > `expiry_d3`(만료 3일 이내) > `expiry_d7`
- 유효 수강권은 `status = 'active' and end_date >= current_date` 중 먼저 끝나는 것
- 주의: `current_date`는 **DB 시간대(Supabase 기본 UTC)** 기준이다. KST 자정~오전 9시에는 하루 어긋날 수 있다(현재 동작, 미수정).

## 4. 함수(RPC)

전부 `security definer`, `service_role`만 실행 가능. 회원 단위 `pg_advisory_xact_lock(hashtext(member_id))`로 같은 회원에 대한 동시 호출을 줄 세운다.

| 함수 | 쓰는 곳 | 하는 일 | 오류코드 |
|---|---|---|---|
| `check_in_member(p_member_id)` (004판) | `/check-in` | 15분 쿨다운 → 기간 경과 정리 → 먼저 끝나는 유효 수강권 1회 차감 → 출석 기록 | `CHECK_IN_MEMBER_NOT_FOUND` `CHECK_IN_COOLDOWN` `CHECK_IN_NO_ENTITLEMENT` `CHECK_IN_NO_REMAINING_COUNT` `CHECK_IN_NOT_STARTED` `CHECK_IN_ENTITLEMENT_EXPIRED` |
| `admin_add_attendance(p_member_id, p_date)` (005) | 관리자 출석부 | 지정일 정오(KST)로 수동 출석 + 차감. 쿨다운 대신 같은 날 중복만 막음 | 위 + `ATTENDANCE_FUTURE_DATE` `ATTENDANCE_DUPLICATE_DATE` |
| `admin_cancel_attendance(p_attendance_id)` (005) | 관리자 출석부 | 출석 삭제 + 1회 복구(`used_up`이면 기간 남을 때 `active`로) | `ATTENDANCE_NOT_FOUND` |
| `check_in_member_once(p_member_id, p_request_id)` (006) | **아직 없음**(회원 화면 작업에서 전환 예정) | 아래 5절 | `check_in_member()`와 같음 |

오류코드 → 화면 문구는 `app/lib/checkin-messages.ts`, 원본은 `design.md` 6.5.

## 5. 체크인 멱등성 (006)

**문제**: "같은 회원이 짧은 시간 안에 다시 스캔해도 두 번 차감하지 않는다."

**지금(004)도 이중 차감은 막힌다.** 15분 쿨다운을 회원 잠금 안에서 확인하므로 동시 요청 20개가 와도 1개만 차감된다
(로컬 DB 테스트 `e2e/db/checkin-idempotency.spec.ts`로 확인). 다만 두 번째 요청은 **오류(CHECK_IN_COOLDOWN)** 로 끝나서,
응답을 못 받고 다시 누른 회원은 "방금 출석 처리되었습니다. 잠시 후 다시 시도해 주세요."만 보고 잔여 횟수를 확인할 수 없다.

**006이 더하는 것**: `check_in_member_once(회원, 요청ID)`
1. 같은 요청ID가 이미 처리됐으면 → 그때의 출석과 현재 잔여 횟수를 돌려준다 (`replayed = true`, 차감 없음). 15분이 지나도 같다.
2. 15분 안에 출석이 있으면 → 그 출석을 돌려준다 (`replayed = true`, 차감 없음, **오류 아님**)
3. 아니면 → 004의 `check_in_member()`를 그대로 불러 1회 차감한다 (`replayed = false`)

15분은 004의 쿨다운과 같은 값이다. 창을 더 짧게(예: 10분) 잡으면 10~15분 사이에는 안쪽 함수가 COOLDOWN을 던지므로 둘을 맞춰 뒀다.

**앱 전환 방법**(회원 화면 작업 몫): `app/check-in/actions.ts`의 `checkIn`이
`rpc("check_in_member_once", { p_member_id, p_request_id })`를 부르고, 브라우저는 선택 버튼을 누를 때 `crypto.randomUUID()`로
요청ID를 만들어 재시도 때 같은 값을 보낸다. `replayed = true`면 성공 카드를 보여주되 "이미 출석되어 있습니다" 류로 구분한다.
**006이 실제 DB에 적용되기 전에 앱을 전환하면 체크인이 전부 실패한다** — 적용 확인 후 배포할 것.

## 6. 시간대

- DB 서버 시간대는 UTC(Supabase 기본). 로컬 테스트 DB도 일부러 UTC로 띄운다.
- 날짜 판단은 함수 안에서 `now() at time zone 'Asia/Seoul'`로 KST로 바꿔서 한다. 앱은 `lib/format.ts`의 `todayKst()`.
- 예외: `retention_targets` 뷰의 `current_date`(UTC). 3절 주의 참고.

## 7. 로컬 테스트 DB에서 이 상태를 재현하는 법

```bash
cd app
node test-db/start.mjs --seed   # Postgres 16 + PostgREST, 001→003→004→005→006 적용 + 가짜 데모 데이터
```

`test-db/bootstrap.sql`이 Supabase의 기본 롤(`anon`·`authenticated`·`service_role`)과 `auth.users`를 흉내 낸다.
실제 Supabase에는 실행하지 않는다.
