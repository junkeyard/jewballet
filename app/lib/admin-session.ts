import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { serverEnv } from "@/lib/env.server";

// 관리자 세션.
//
// v1은 고정 문자열 토큰을 쿠키에 넣어, 쿠키가 한 번 새면 영구히 유효했다.
// v2는 만료 시각을 payload에 넣고 HMAC으로 서명한다 — 탈취돼도 12시간 뒤 무효다.
// 학원 데스크 1대 운영이라 서버측 세션 저장소는 두지 않는다.

const COOKIE_NAME = "jb_admin";
const SESSION_HOURS = 12;

function sign(payload: string) {
  return createHmac("sha256", serverEnv.adminSessionSecret)
    .update(payload)
    .digest("base64url");
}

function safeEqual(a: string, b: string) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function createToken() {
  const expiresAt = Date.now() + SESSION_HOURS * 60 * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ exp: expiresAt })).toString(
    "base64url",
  );
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token: string | undefined): boolean {
  if (!token) return false;

  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  if (!safeEqual(signature, sign(payload))) return false;

  try {
    const { exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
    return typeof exp === "number" && Date.now() < exp;
  } catch {
    return false;
  }
}

/** 입력한 비밀번호가 맞으면 세션 쿠키를 심는다. */
export async function signInAdmin(password: string): Promise<boolean> {
  if (!password || !safeEqual(password, serverEnv.adminAccessPassword)) {
    return false;
  }

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, createToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_HOURS * 60 * 60,
  });
  return true;
}

export async function signOutAdmin() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function isAdminSignedIn(): Promise<boolean> {
  const cookieStore = await cookies();
  return verifyToken(cookieStore.get(COOKIE_NAME)?.value);
}

/**
 * 서버 액션 앞단 가드. 세션이 없으면 던진다.
 * 페이지 렌더는 isAdminSignedIn()으로 분기하고, 쓰기 동작은 반드시 이걸 통과시킨다.
 */
export async function requireAdmin() {
  if (!(await isAdminSignedIn())) {
    throw new Error("ADMIN_UNAUTHORIZED");
  }
}
