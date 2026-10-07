# 테스트 실행법

실제 Supabase·실제 키 없이 돈다. 모든 명령은 `app/`에서 실행한다.

| 명령 | 하는 일 |
|---|---|
| `npm run lint` · `npm run typecheck` · `npm run build` | 정적 검사·빌드 |
| `npm run test:e2e` | 테스트 DB와 앱(포트 3100)을 띄우고 Playwright 전체 실행 |
| `npx playwright test --project=mobile-chromium` | 브라우저 하나만 |
| `npm run testdb` | 테스트 DB만 띄우고 가짜 데모 데이터 입력 → 다른 터미널에서 아래 환경변수로 `npm run dev` |

## 구성

- **테스트 DB** (`test-db/start.mjs`): 임시 폴더에 Postgres 16을 새로 만들고 `bootstrap.sql`(Supabase 기본 롤 흉내) →
  `supabase/001 → 003 → 004 → 005 → 006`을 적용한 뒤 PostgREST(Supabase가 쓰는 REST 서버)와 작은 프록시를 띄운다.
  앱은 `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`로 여기에 붙는다. 키·비밀번호는 `test-db/config.mjs`의 가짜 값(관리자 비밀번호 `0000`).
- **장애 주입**: 프록시에 `POST /__fault {"down":true,"pathIncludes":"/rpc/check_in_member"}`를 보내면 맞는 요청을 끊는다(네트워크 실패 테스트).
- **데이터**: 테스트마다 DB를 비우고 필요한 가짜 데이터만 만든다(`e2e/support/db.ts`). 이름·전화번호는 전부 가짜(010-0000-xxxx 대역 등).
- 필요한 것: Postgres 16 서버 바이너리(없으면 `PG_BIN`으로 위치 지정). PostgREST는 없으면 `.testdb/bin`에 자동으로 받는다(linux x64).
  Windows PC에서는 WSL에서 돌리는 것을 권한다.

## 프로젝트(브라우저)

| 이름 | 기기 | 내용 |
|---|---|---|
| `db` | — | DB 함수 동시성·멱등성 (`e2e/db/`) |
| `mobile-webkit` | iPhone 13 (WebKit) | 화면 테스트 전부 + 폭 360/390/430 스크린샷 |
| `mobile-chromium` | Pixel 7 (Chromium) | 〃 |
| `desktop-chromium` | 1280px | 화면 테스트 전부 + 1280 스크린샷 |

스크린샷은 `docs/screens/<프로젝트>/<화면>-<폭>.png`에 덮어써진다. 각 스크린샷 전에 "페이지 가로 스크롤 없음"과
"화면 밖으로 나간 요소 없음"을 자동으로 검사한다(표·관리자 탭처럼 자체 가로 스크롤 영역 안은 제외). 겹침은 사람이 본다.

## WebKit과 관리자 로그인 쿠키

앱은 운영 빌드에서 관리자 세션 쿠키에 `Secure`를 붙인다. WebKit은 `http://127.0.0.1`에서 이 쿠키를 저장하지 않으므로,
`adminLogin()`(e2e/support/fixtures.ts)이 로그인 응답의 쿠키 값을 받아 테스트 브라우저에 직접 넣는다. 앱 동작은 그대로다.

## 알려진 결함 표시

`test.fail()`이 붙은 테스트는 **현재 동작이 틀렸다는 것을 기록한 것**이다(예: 폰 오프라인 시 체크인 화면 전체가 오류로 바뀜).
고치면 그 테스트가 "예상 밖 통과"로 빨개지므로 그때 `test.fail()`을 지운다.
