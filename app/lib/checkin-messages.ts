// check_in_member() RPC가 던지는 오류코드를 회원용 문구로 옮긴다.
// 문구는 design.md 6.5 메시지 매핑 표가 원본이다 — 여기만 고치지 말고 그쪽을 먼저 고칠 것.
// 기술 용어·오류코드를 화면에 그대로 노출하지 않는다.

import type { ActionState } from "@/lib/types";

type Mapped = { status: ActionState["status"]; message: string };

const MESSAGES: Record<string, Mapped> = {
  CHECK_IN_COOLDOWN: {
    status: "info",
    message: "방금 출석 처리되었습니다. 잠시 후 다시 시도해 주세요.",
  },
  CHECK_IN_MEMBER_NOT_FOUND: {
    status: "error",
    message: "일치하는 회원이 없습니다. 데스크에 문의해 주세요.",
  },
  CHECK_IN_NO_ENTITLEMENT: {
    status: "warn",
    message: "사용 가능한 수강권이 없습니다. 수강권 등록 후 이용 가능합니다.",
  },
  CHECK_IN_NO_REMAINING_COUNT: {
    status: "warn",
    message: "남은 횟수가 없습니다. 재등록 후 이용 가능합니다.",
  },
  CHECK_IN_ENTITLEMENT_EXPIRED: {
    status: "warn",
    message: "이용 기간이 종료되었습니다. 재등록 후 이용 가능합니다.",
  },
  CHECK_IN_NOT_STARTED: {
    status: "info",
    message: "수강권 시작일 이전입니다. 시작일부터 이용 가능합니다.",
  },
};

const FALLBACK: Mapped = {
  status: "error",
  message: "출석 처리 중 오류가 발생했습니다. 데스크에 문의해 주세요.",
};

/**
 * Supabase가 돌려주는 에러 메시지 안에서 CHECK_IN_* 코드를 찾아 문구로 바꾼다.
 * Postgres raise exception은 코드 앞뒤에 부가 텍스트를 붙여 오므로 포함 여부로 찾는다.
 */
export function mapCheckInError(raw: string | null | undefined): Mapped {
  if (!raw) return FALLBACK;
  for (const [code, mapped] of Object.entries(MESSAGES)) {
    if (raw.includes(code)) return mapped;
  }
  return FALLBACK;
}

export const CHECK_IN_SUCCESS = "출석이 완료되었습니다.";
export const EMPTY_ATTENDANCE = "아직 출석 기록이 없습니다.";
export const EMPTY_ENTITLEMENT = "현재 이용 가능한 수강권이 없습니다.";
