# Jewballet Member System — Design System

> 이 문서는 모든 페이지/컴포넌트 작업 시 **단일 디자인 진실 공급원(single source of truth)** 이다.
> Codex / Claude Code / ChatGPT에 프롬프트 보낼 때 항상 첨부할 것.
> 한 페이지 작업 후 토큰값/규칙이 어색하면 코드를 고치기 전에 **이 파일부터 수정**한다.

---

## 0. Brand Soul

성인 발레학원의 멤버 관리 시스템.
"발레 살롱의 따뜻함" × "학원 운영의 명료함" 두 축을 동시에 만족시킨다.

- 회원용 화면 (`/`, `/check-in`, `/member`)
  → **단순, 큼직, 부드러움**. 회원이 휴대폰으로 1초 안에 행동할 수 있어야 함.
- 관리자용 화면 (`/admin`)
  → **실무 대시보드**. 정보 밀도 우선, 장식 최소화, PC 가독성 중심.

**피해야 할 톤**
- 기업형 SaaS 보라/파랑 그라데이션
- 과한 글래스모피즘
- 의미 없는 영문 라벨 (예: 모든 카드에 "ENTRY" 붙이기)
- 개발 용어 노출 (Day1, MVP, Beta 등)

---

## 1. Color Tokens

CSS 변수로 `app/globals.css`에 박아둔다. 컴포넌트에서 hex 직접 쓰지 않는다.

```css
:root {
  /* Base */
  --bg: #FAF6F0;          /* 크림/아이보리 배경 */
  --surface: #FFFFFF;     /* 카드 표면 */
  --surface-alt: #F4EDE3; /* 보조 영역 (요약 카드 등) */
  --border: #E8DFD2;      /* 카드/입력 테두리 */

  /* Ink (텍스트) */
  --ink: #2B1F17;         /* 본문/제목 짙은 브라운 */
  --ink-muted: #7A6A5C;   /* 보조 텍스트 */
  --ink-faint: #B5A899;   /* placeholder, 캡션 */

  /* Accent */
  --accent: #8B5A3C;      /* 메인 브라운 포인트 */
  --accent-soft: #C8A48A; /* 호버/포커스 보조 */

  /* Semantic */
  --success-bg: #E8F0E5;
  --success-ink: #4A6B3F;
  --warn-bg:    #FBEFD9;  /* 리텐션, 만료 임박 */
  --warn-ink:   #A56C1F;
  --error-bg:   #F6E3E0;
  --error-ink:  #9B3B2E;
  --info-bg:    #ECE5F0;
  --info-ink:   #5D4A6B;
}
```

**사용 규칙**
- 카드 배경은 항상 `--surface`, 페이지 배경은 `--bg`
- 텍스트 위계: 제목/숫자 = `--ink`, 본문 = `--ink`, 보조 설명 = `--ink-muted`, placeholder = `--ink-faint`
- 메시지 색은 의미 단위로만 사용. 장식 목적 색칠 금지

---

## 2. Typography

```css
--font-serif: "Noto Serif KR", "Nanum Myeongjo", serif;  /* 제목 한글 */
--font-sans:  "Pretendard", -apple-system, sans-serif;   /* 본문 */
--font-mono:  ui-monospace, "JetBrains Mono", monospace; /* 숫자/코드 */
```

**스케일 (모바일 우선, md 이상에서 키움)**

| 용도 | 모바일 | 데스크탑 | weight | font |
|---|---|---|---|---|
| 페이지 라벨 (eyebrow) | 12px / tracking 0.18em | 13px | 500 | sans |
| H1 (히어로) | 26px | 44px | 700 | serif |
| H2 (섹션) | 20px | 24px | 600 | sans |
| H3 (카드 제목) | 17px | 18px | 600 | sans |
| 본문 | 15px | 16px | 400 | sans |
| 보조 캡션 | 13px | 13px | 400 | sans |
| 큰 숫자 (남은 횟수) | 40px | 56px | 700 | mono |

**필수 규칙**
- 모바일에서 H1은 **세로 줄바꿈 최대 2줄**까지만 허용. 3줄 넘으면 폰트 사이즈 줄이기
- 한글 H1은 줄바꿈 위치를 `<br />` 또는 `word-break: keep-all`로 의미 단위 보존
- 영문 라벨(eyebrow)은 항상 대문자 + letter-spacing

---

## 3. Spacing & Radius

```
spacing scale: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64
radius:        sm 8px / md 12px / lg 20px / xl 28px
```

- 카드 padding: 모바일 20px / 데스크탑 24~28px
- 카드 radius: 20px (lg)
- 페이지 좌우 여백: 모바일 20px / 데스크탑 max-width 1200px + auto margin
- 섹션 간 간격: 32~48px

---

## 4. Components

### 4.1 Card
- 배경 `--surface`, 테두리 `1px solid --border`, radius 20px
- shadow는 매우 옅게: `0 1px 2px rgba(43,31,23,0.04), 0 8px 24px rgba(43,31,23,0.04)`
- 클릭 가능한 카드는 전체 영역이 클릭 영역. 호버 시 테두리만 `--accent-soft`로 변경
- 카드 안 라벨은 **카드 의미에 맞게 다르게** (전부 "ENTRY" 같은 식 금지)

### 4.2 Button
- 1차 버튼: 배경 `--accent`, 텍스트 `--surface`, radius 12px, 높이 모바일 52px / 데스크탑 44px
- 2차 버튼: 테두리 `--border`, 텍스트 `--ink`
- 위험 버튼 (출석 취소 등): 테두리 `--error-ink`, 텍스트 `--error-ink`, 배경 투명

### 4.3 Input (체크인 4자리)
- 높이 **모바일 56px** (큰 터치 영역 필수)
- font-size 20px, letter-spacing 0.3em, text-align center
- `inputmode="numeric"` `pattern="[0-9]*"` 필수 → 모바일에서 숫자 키패드 자동
- placeholder는 `--ink-faint`로 옅게

### 4.4 Message Banner
- success / warn / error / info 4종
- radius 12px, padding 12px 16px
- 좌측에 의미 아이콘 1개 (text emoji 또는 lucide-react)
- 본문은 **행동 안내형 문구**, 기술 메시지 금지

### 4.5 Stat Block (회원 페이지 핵심)
- 큰 숫자 + 라벨 + 보조 설명 3행 구조
- 숫자는 `--font-mono`, 라벨은 `--ink-muted` 13px

---

## 5. Page-specific Rules

### 5.1 `/` 메인 (회원/관리자 공용 허브)
- 히어로 1개 + 카드 3개 (QR 체크인 / 회원 정보 / 관리자)
- **QR 체크인 카드가 시각적으로 가장 강조** (정렬상 첫 번째, 또는 살짝 큰 크기)
- 카드별 라벨은 **각자 다르게**:
  - QR 체크인 → `CHECK-IN`
  - 회원 정보 → `MEMBER`
  - 관리자 → `ADMIN`

### 5.2 `/check-in` (모바일 최우선)
- 헤더 최소화 (뒤로가기 + 작은 로고만)
- 4자리 입력창이 화면의 중심
- 검색 결과 회원 카드는 **세로 스택**, 카드 높이 64px 이상, 이름은 크게
- 성공/오류 메시지는 입력창 바로 아래 고정
- 푸터/네비게이션 노출 금지 (회원이 다른 곳 가지 않게)

### 5.3 `/member` (회원 본인 확인)
- 상단 요약 카드 3개: **남은 횟수 / 만료일 / 현재 이용권**
  - 남은 횟수는 큰 숫자 (예: `12 / 20회`)
  - 만료일은 D-day 뱃지 (D-7 이하면 `--warn` 컬러)
- 그 아래 회원 기본 정보, 현재 이용권, 월간 출석 달력, 최근 출석 기록 (5건)
- 월간 출석 달력은 선택한 달의 전체 출석 데이터를 조회하고, 출석한 날짜만 accent로 표시
- 이전 달과 다음 달을 이동할 수 있되 미래 월은 선택하지 않음
- 빈 상태 문구 명확히: "현재 이용 가능한 수강권이 없습니다."

### 5.4 `/admin` (PC 우선)
- max-width 1200px, 좌측 sticky 섹션 anchor 또는 상단 탭
- 섹션 순서: 운영 요약 → 회원/소속반 관리 → 수강권 부여 → 월간 출석부 → 최근 출석 → 연락 필요 회원 → 재등록 후보 → 최근 등록/수강권 → 활성 수강권
- 표는 sticky 헤더, 행 호버 표시
- 월간 출석부는 월/소속반 필터와 인쇄 기능을 제공하고, 한 행에 회원 한 명·한 열에 날짜 하나를 배치
- 회원은 하나의 주 소속반을 가지며 출석 당시 소속반을 출석 기록에 스냅샷으로 보존
- 리텐션 표는 사유별 컬러 뱃지:
  - 10일 미출석 = `--warn`
  - 14일 미출석 = `--error`
  - 만료 D-7 = `--warn`
  - 만료 D-3 = `--error`
- 과거 수강권 이력이 있으나 현재 유효 수강권이 없는 회원은 `재등록 후보`로 별도 표시

---

## 6. Copy (확정 문구)

### 6.1 `/`
- eyebrow: `JEWBALLET MEMBER SYSTEM`
- H1: `QR 체크인으로 간편하게\n출석과 수강 정보를 확인하세요`
- desc: `입구 QR을 통해 빠르게 출석 체크를 하고, 남은 횟수와 이용 기간을 바로 확인할 수 있습니다.`
- 카드:
  - `CHECK-IN` / **QR 체크인** / 전화번호 뒤 4자리로 빠르게 출석 체크
  - `MEMBER` / **회원 정보 확인** / 남은 횟수, 만료일, 출석 기록 확인
  - `ADMIN` / **관리자 페이지** / 회원 등록, 수강권 관리, 출석 관리

### 6.2 `/check-in`
- eyebrow: `CHECK-IN`
- H1: `전화번호 뒤 4자리로 출석 체크`
- desc: `입구에서 빠르게 체크인할 수 있습니다.\n번호 입력 후 본인을 선택해주세요.`
- placeholder: `예: 2162`
- 카드 액션 캡션: `눌러서 바로 체크인`

### 6.3 `/member`
- eyebrow: `MEMBER`
- H1: `{회원명}님의 이용 현황`
- desc: `현재 이용 상태와 최근 출석 기록을 확인할 수 있습니다.`
- 섹션 제목: `회원 기본 정보` / `현재 이용권` / `최근 출석 기록`

### 6.4 `/admin`
- eyebrow: `ADMIN`
- H1: `회원 관리 및 수강권 운영`
- desc: `회원 등록, 수강권 관리, 출석 관리 및 리텐션 대상 확인`
- 섹션: `회원 등록` / `수강권 부여` / `최근 등록 회원` / `최근 수강권 부여` / `출석 관리` / `연락 필요 회원` / `활성 수강권 참고`

### 6.5 메시지 매핑 (모두 행동 안내형)
| 상황 | 종류 | 문구 |
|---|---|---|
| 체크인 성공 | success | 출석이 완료되었습니다. |
| 15분 내 중복 (COOLDOWN_ACTIVE) | info | 방금 출석 처리되었습니다. 잠시 후 다시 시도해 주세요. |
| 회원 매칭 실패 | error | 일치하는 회원이 없습니다. 데스크에 문의해 주세요. |
| 수강권 없음 | warn | 사용 가능한 수강권이 없습니다. 수강권 등록 후 이용 가능합니다. |
| 횟수 소진 | warn | 남은 횟수가 없습니다. 재등록 후 이용 가능합니다. |
| 기간 종료 | warn | 이용 기간이 종료되었습니다. 재등록 후 이용 가능합니다. |
| 기타 오류 | error | 출석 처리 중 오류가 발생했습니다. 데스크에 문의해 주세요. |
| 출석 기록 없음 (빈 상태) | info | 아직 출석 기록이 없습니다. |
| 수강권 없음 (빈 상태) | info | 현재 이용 가능한 수강권이 없습니다. |

---

## 7. Skills (재료) — 페이지별 스택

각 페이지를 만들 때 design.md 베이스 위에 아래 "스킬" 하나씩 얹어 프롬프트.

- `/` → **editorial / magazine layout** — 큰 세리프 H1, 여백 넉넉, 카드 3분할
- `/check-in` → **mobile-first, large tap target** — 56px 입력창, 카드 64px+, 푸터 없음
- `/member` → **stats hero card** — 큰 숫자 + D-day 뱃지 + 보조 정보 위계
- `/admin` → **data-dense admin** — sticky 헤더 표, 섹션 anchor, 컬러 뱃지로 상태 구분

---

## 8. Do / Don't 체크리스트

### Do
- [ ] 모든 색은 CSS 변수 토큰으로
- [ ] 모바일 360px에서 제목 줄바꿈 의미 단위 보존
- [ ] 터치 영역 최소 52px (1차 버튼) / 56px (입력)
- [ ] 빈 상태(empty state) 문구 모든 리스트에 명시
- [ ] 카드 라벨은 카드 의미에 맞게 차별화
- [ ] 메시지는 행동 안내형으로

### Don't
- [ ] hex 코드 직접 박지 않기
- [ ] `ENTRY` 같은 무의미 공용 라벨 반복 금지
- [ ] Day1 / MVP / Beta 등 개발 용어 노출 금지
- [ ] 모바일 체크인 페이지에 푸터/네비게이션 추가 금지
- [ ] 관리자 페이지를 회원 페이지 톤(과한 장식)으로 만들지 말기
- [ ] 보라/파랑 그라데이션 SaaS 톤 금지

---

## 9. 참조 레퍼런스 (taste 인풋 — Meng To 영상 48:25 "second brain")

**도메인 톤 (발레/요가 살롱)**
- glo.com, alomoves.com (요가 회원제, 따뜻한 톤)
- classpass.com (체크인 플로우)
- mindbodyonline.com (학원 운영 관리자 뷰)

**모바일 UI 레퍼런스 (`/check-in` 참조)**
- mobbin.com — "check-in" / "OTP input" 검색
- screenlane.com

**대시보드 레퍼런스 (`/admin` 참조)**
- refero.design — admin table
- page-flows.com — onboarding/admin flows
- dribbble.com — "admin dashboard table warm"

**랜딩 톤 (`/` 참조)**
- land-book.com — "cream" / "serif" 태그
- godly.website
- lapa.ninja

**컬러 팔레트**
- coolors.co/palettes "warm cream brown"
- huemint.com — 브랜드 톤 추천

---

## 10. 운영 규칙

- 디자인 수정 → 코드 수정 전 **이 파일 먼저** 갱신
- 새 메시지 추가 시 6.5 메시지 매핑 표에 먼저 추가
- 새 컴포넌트 만들기 전 4번 섹션에 정의 추가
- 비즈니스 로직, DB schema, server action 변경 시도 금지 (개요서 10장 원칙)
