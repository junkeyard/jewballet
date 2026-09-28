// 로컬 테스트 DB 스택의 고정 설정. 실제 Supabase와는 아무 관계가 없다.
//
//   Postgres(54329) ← PostgREST(54330) ← 프록시(54321, /rest/v1 → /) ← Next 앱(3100)
//
// 여기 적힌 비밀값은 전부 로컬 테스트 전용 가짜 값이다. 운영 키로 바꾸지 말 것.

import { createHmac } from "node:crypto";

export const PG_PORT = Number(process.env.TESTDB_PG_PORT ?? 54329);
export const PGRST_PORT = Number(process.env.TESTDB_PGRST_PORT ?? 54330);
export const PROXY_PORT = Number(process.env.TESTDB_PROXY_PORT ?? 54321);
export const APP_PORT = Number(process.env.E2E_APP_PORT ?? 3100);

export const SUPABASE_URL = `http://127.0.0.1:${PROXY_PORT}`;
export const APP_URL = `http://127.0.0.1:${APP_PORT}`;

// PostgREST는 32자 이상의 HS256 비밀을 요구한다.
export const JWT_SECRET = "local-test-only-jwt-secret-not-for-production-0000";
export const ADMIN_PASSWORD = "0000";
export const ADMIN_SESSION_SECRET = "local-test-only-admin-session-secret";

function base64url(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function signJwt(payload) {
  const head = base64url({ alg: "HS256", typ: "JWT" });
  const body = base64url(payload);
  const sig = createHmac("sha256", JWT_SECRET)
    .update(`${head}.${body}`)
    .digest("base64url");
  return `${head}.${body}.${sig}`;
}

// Supabase의 service_role / anon 키와 같은 모양(role 클레임을 담은 JWT)을 만든다.
export const SERVICE_ROLE_KEY = signJwt({
  iss: "jewballet-local-test",
  role: "service_role",
  exp: 4102444800, // 2100-01-01
});
export const ANON_KEY = signJwt({
  iss: "jewballet-local-test",
  role: "anon",
  exp: 4102444800,
});

/** Next 앱을 테스트 DB에 붙일 때 쓰는 환경변수 */
export const APP_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
  ADMIN_ACCESS_PASSWORD: ADMIN_PASSWORD,
  ADMIN_SESSION_SECRET: ADMIN_SESSION_SECRET,
};
