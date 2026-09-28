---
작성일: 2026-07-22
분류: 공지
tags:
  - jewballet
  - QR체크인
---

# QR 체크인 v2 재제작 설계안

> **현황 (2026-09-07 확인)**
> - 상태: **구현완료 / 배포 전 / 실사용 없음.** `C:\claude\checkin\app` 빌드·`tsc`·`npm audit` 통과(07-22). 07-22 이후 코드 변경 0건.
> - 운영정본: 코드 `C:\claude\checkin\`(유일본), SQL·design.md 원본은 이 폴더. `app\scripts\smoke.mjs`(스키마·RPC 점검, 07-22 16:53)는 아래 파일 목록에 빠져 있다.
> - DB 적용 상태: 07-22 실측 기준 **001·002 적용, 003·004·005 미적용**(아래 "Supabase 실측 상태"). 그 뒤 재확인한 기록 없음 → 실행 전 `smoke.mjs`(읽기 모드)로 현재 스키마를 다시 확인할 것. **오래된 목록(아래 결정 사항의 "004만")을 그대로 실행하지 말 것.**
> - 다음검증(2026-09-07 2차 순서 정정 — 복구 수단을 변경 전에 확보): ① Supabase 대시보드에서 프로젝트 상태·현재 URL 확인 → ② 소스 보존본(GitHub 비공개 저장소, 현재 `.git` 없음)과 DB 변경 전 복구 수단(백업/스냅샷) 확보 → ③ `smoke.mjs`(읽기)로 현재 스키마·적용 이력 확인 → ④ 미적용으로 확인된 003·004·005만 의존 순서대로 적용 → ⑤ smoke·로컬 통합 테스트 → ⑥ Vercel 배포·시범 운영 판단. 이미 적용된 SQL을 문서의 과거 상태만 보고 재실행하지 않는다.
> - 미확인: 실제 DB 현재 스키마와 프로젝트 상태. **09-07 회사 PC에서 `smoke.mjs`(읽기)가 응답 없이 멈췄고, 같은 PC의 DNS 조회에서 `.env.local`의 프로젝트 호스트가 NXDOMAIN으로 응답한 실행 기록이 있다**(supabase.com은 200). 이는 로컬 관측이며 서비스 전체의 존재 여부 판정이 아니다 — 프로젝트 상태·현재 URL은 대시보드에서 미확인.

## 결정 사항 (2026-07-22)

- **방식**: DB 스키마는 유지·패치, Next.js 앱 계층은 제로베이스 재제작 (Claude Fable 5).
- **코드 작업 위치**: **`C:\claude\checkin\`** (Dropbox 밖 로컬). **C:\codex 폴더는 은퇴.**
- **Supabase 프로젝트는 기존 것 그대로 사용**. ~~`supabase/004_fix_expiry_and_cleanup.sql`만 추가 실행하면 됨.~~ → *(2026-09-07 정정: 초안 시점 기록. 같은 날 실측(아래 "Supabase 실측 상태")에서 003도 미적용으로 확인돼 실행할 것은 **003 → 004 → 005** 세 개다. 001·002는 실행 금지.)*

### ⚠️ 코드를 Dropbox 밖으로 옮긴 이유 (2026-07-22 이전)

첫 `npm install`을 Vault 안에서 돌리자 회사 PC의 파일유출방지 프로그램(Privacy-i)이
node_modules 파일 **약 700개**를 격리했고, 내가 쓴 `lib/supabase/server.ts`·`lib/rate-limit.ts`도
쓰는 족족 회수해 갔다. `node_modules`에 `com.dropbox.ignored`를 걸어 **Dropbox가 동기화하지 않는
상태였는데도** 격리됐다 — Privacy-i는 동기화 여부가 아니라 **Dropbox 경로 자체**를 감시한다.
따라서 Dropbox 동기화 일시중지는 해결책이 아니고, 코드 트리를 경로 밖으로 빼는 것만이 답이다.

옮긴 뒤 `npm install`(34패키지) + `tsc --noEmit` 모두 신규 격리 0건으로 통과했다.

## 폴더 구성

**코드 — `C:\claude\checkin\`** (Dropbox 밖, 이 PC 전용)
```
checkin/
├── app/                ← v2 Next.js 프로젝트 (작업 중)
│   ├── lib/            ← env.ts · env.server.ts · rate-limit.ts · supabase/server.ts
│   ├── package.json · tsconfig.json · next.config.mjs · .env.local
│   └── node_modules/   ← 로컬 전용, 백업·동기화 대상 아님
├── supabase/           ← SQL 사본 (원본은 Vault)
└── design.md           ← 사본 (원본은 Vault)
```

**지식·문서 — Vault `4_Output/jewballet/QR_체크인/`**
```
QR_체크인/
├── 2026-07-22 QR체크인_v2_설계안.md   ← 이 문서
├── design.md                          ← 디자인 시스템 (v1에서 계승, 유효)
├── supabase/                          ← 001~003 + 004·005(신규) — 원본
├── _reference/codex_v1/               ← 구버전 소스·문서 아카이브 (읽기 전용, 쓰지 않으므로 안전)
└── QR_체크인_월간출석_설치운영_매뉴얼.md ← v1 매뉴얼 (배포 후 v2로 개정 예정)
```

- `design.md`·`supabase/*.sql`은 **Vault가 원본**. 고칠 일이 생기면 Vault에서 고치고 `C:\claude\checkin`으로 복사한다.
- 집 PC에서도 개발하려면 **GitHub 비공개 저장소**를 쓴다(Dropbox로 코드를 나르지 않는다). `.env.local`은 커밋하지 않고 손으로 옮긴다.

## 유지 자산 / 폐기 대상

| 유지 | 폐기 |
|---|---|
| Supabase 스키마 + RLS 잠금 구조 | v1 페이지·actions 전부 |
| `check_in_member()` RPC (004로 수정) | URL 파라미터(`?error=`) 오류 전달 패턴 |
| `design.md` 컬러 토큰·확정 문구 | 고정값 관리자 세션 토큰 |
| 요금제·반 구성 운영 데이터 | `admin_profiles` 테이블 (004에서 drop) |

## 004 패치 핵심 (재등록 차단 버그)

v1의 치명 결함: 기간이 지나도 수강권 status가 `active`로 남아, 재등록한 회원도
`CHECK_IN_ENTITLEMENT_EXPIRED`로 출석이 막힘. 004에서 수정:

1. 함수 진입 시 기간 경과 active 수강권을 `expired`로 자동 전환
2. 유효 수강권 선택을 먼저 수행, 실패 시에만 사유 진단 (신규 오류코드 `CHECK_IN_NOT_STARTED`, `CHECK_IN_MEMBER_NOT_FOUND` 추가 — v2 앱에서 문구 매핑)
3. `retention_targets` 뷰에서 기간 경과 수강권 제외
4. 미사용 `admin_profiles` 제거

## v2 앱 설계

**스택**: v1과 동일 최소 구성 — Next.js 15 App Router + `@supabase/supabase-js`(service role, 서버 전용). 추가 의존성 최소화.

### 회원측 (모바일 우선)
- `/` 허브 — v1 구성 유지, design.md 문구 그대로
- `/check-in` — 뒤 4자리 입력 시 **자동 검색**(버튼 불필요), 인라인 피드백, 성공 시 잔여횟수·만료일 큰 카드
- `/member` — 잔여횟수·D-day·월간 달력 (v1 기능 계승)

### 관리자측 `/admin` (PC 우선, 탭 구조) ★확장
Supabase 콘솔 없이 웹앱에서 전부 처리하는 것이 목표:

| 탭 | 기능 | v1 대비 |
|---|---|---|
| 대시보드 | 오늘 출석·리텐션·재등록 후보 요약 | 개선 |
| 회원 | 등록 + **검색·수정·상태 변경·소속반 변경** | 수정 기능 신규 |
| 수강권 | 부여 + **정정(횟수·기간)·취소** | 정정·취소 신규 |
| **상품(수강료)** | **요금제 CRUD — 이름·횟수·기간·가격 웹에서 수정** | 전면 신규 |
| 출석부 | 월간 출석부·인쇄·출석 취소 + **수동 출석 등록** | 수동 등록 신규 |
| 반 관리 | 반 추가·이름 변경·정렬·비활성화 | 수정 신규 |

### UX 원칙
- 오류·성공 피드백은 `useActionState` 인라인 배너 (전체 리로드·URL 파라미터 금지)
- 문구는 design.md 6.5 매핑 표 준수 (행동 안내형)
- 터치 영역: 입력 56px+, 버튼 52px+ (모바일)

### 보안 보강 (v1 지적사항 반영)
- 관리자 세션: **만료 시각 포함 서명 토큰**(HMAC) — 쿠키 탈취 시에도 12시간 후 무효
- 관리자 로그인·회원 검색에 간이 rate limit (메모리 기반, Vercel 단일 인스턴스 전제)
- 출석 취소·횟수 복구는 RPC로 원자화 (005에서 추가 검토)
- `/member` 접근은 우선 UUID 방식 유지, 운영 후 단기 서명 토큰 검토

## 진행 단계

1. ~~작업 공간 구성 + 004 패치 작성~~ ← 완료 (2026-07-22)
2. ~~`app/` 스캐폴드 + 회원측 3화면~~ ← 완료 (2026-07-22)
3. ~~관리자 6탭~~ ← 완료 (2026-07-22)
4. ~~Supabase 일시중지 해제(resume)~~ ← 완료 (2026-07-22)
5. **Supabase SQL Editor에서 `003` → `004` → `005` 실행** (사용자) ← **현재 지점**
6. 통합 테스트 → GitHub 비공개 저장소 → Vercel 배포 → QR 인쇄물 → 매뉴얼 개정

### Supabase 실측 상태 (2026-07-22) — 설계안 초안의 기록이 틀렸다

프로젝트는 장기 미접속으로 일시중지돼 있었고 resume으로 복구했다(삭제된 것이 아니었다).
복구 후 스키마를 컬럼 단위로 실측한 결과, **적용 상태가 초안에 적어둔 "001~003 적용됨"과 다르다.**

| 마이그레이션 | 실제 | 근거 |
|---|---|---|
| 001 | **적용됨** | members·plans·entitlements·attendance·retention_targets 존재 |
| 002 | **미적용** | 요금제가 002의 seed(매일반·혼합반…)가 아니다 |
| 003 | **미적용** ★ | `class_groups` 테이블 없음, members·attendance에 `class_group_id` 없음 |
| 004 | **미적용** | `admin_profiles`가 아직 남아 있음 |
| 005 | 미적용 | 신규 |

- 요금제 7건은 001·002 어느 seed와도 다르다 — **콘솔에서 손으로 입력한 실운영 값**이다
  (3개월 주5회 82만 / 1개월 주3회 22만 / 일일 쿠폰 3.5만 등). 건드리지 않는다.
- 회원 2건은 `테스트`·`테스트1`뿐이고 수강권 5·출석 16건도 전부 그 둘의 것이다.
  **실회원 데이터는 없다** — 이 프로젝트는 아직 개발용이다.

**따라서 실행할 것은 003 → 004 → 005 세 개뿐이다. 001·002는 실행하지 않는다.**
- 001은 이미 적용됐고, 재실행하면 폐기된 요금제 seed가 되살아난다.
- 002는 `delete from plans`라서 실운영 요금제를 지운다. (수강권이 있으면 스스로 중단하도록
  방어되어 있지만, 애초에 돌릴 이유가 없다.)
- 순서가 중요하다 — 003이 `admin_profiles`를 참조하는데 004가 그것을 지운다. 003을 먼저.

### 완성된 것 (`C:\claude\checkin\app\`)

`npm run build` 통과 · `tsc --noEmit` 통과 · `npm audit` 취약점 0건 · 전 라우트 200 응답 확인.

| 영역 | 파일 |
|---|---|
| 공통 | `lib/{env,env.server,types,format,queries,rate-limit,checkin-messages,admin-session}.ts`, `lib/supabase/server.ts` |
| 디자인 | `app/globals.css` (design.md 1~3장 토큰), `components/{ui,ActionForm,AttendanceCalendar}.tsx` |
| 회원측 | `app/page.tsx` 허브, `app/check-in/*` (4자리 자동검색·인라인 피드백·성공 카드), `app/member/*` (요약 3카드·월간 달력·최근 출석) |
| 관리자 | `app/admin/layout.tsx`(로그인 게이트+탭) · `page.tsx`(대시보드) · `members` · `entitlements` · `plans` · `attendance` · `groups`, `actions.ts`(전 쓰기 동작) |

**설계안 대비 달라진 것**
- 005 SQL을 새로 썼다(`supabase/005_admin_attendance_rpc.sql`) — 수동 출석 등록·출석 취소를
  `admin_add_attendance()` / `admin_cancel_attendance()` RPC로 원자화. 앱에서 insert와 횟수 갱신을
  따로 하면 중간 실패 시 출석 기록과 잔여 횟수가 어긋나기 때문이다.
- 관리자 로그인은 별도 라우트를 두지 않고 `/admin` 레이아웃에서 가로막는다. 로그인 전에는
  자식 페이지를 렌더하지 않으므로 데이터 조회 자체가 일어나지 않는다.
- 반 삭제 기능은 넣지 않았다. 과거 출석 기록이 소속반을 참조하므로 비활성 전환으로 갈음한다.
- `sharp`·`postcss`를 `overrides`로 올려 취약점 0건을 맞췄다. `npm audit fix --force`는
  Next를 9.3.3으로 내리므로 절대 쓰지 말 것.

## 작업 시 주의사항

- **코드는 절대 Vault(Dropbox) 안에서 만들지 않는다.** `npm install`·빌드는 `C:\claude\checkin`에서만.
  Dropbox 동기화 일시중지로는 Privacy-i를 못 막는다(위 이유 참조).
- 개발·빌드는 한 PC에서만 (CLAUDE.md §7 멀티 PC 원칙 동일 적용).
- `C:\claude\checkin`은 Dropbox 백업을 못 받는다 → **GitHub 비공개 저장소를 백업 겸 PC 간 이동 수단으로 쓴다.**
- 무언가 갑자기 사라지면 `C:\ProgramData\Privacy-i\Quarantine`을 먼저 본다. 원본이 `<파일명>_<타임스탬프>\<파일명>` 형태로 보존돼 있어 복사하면 되돌아온다.
