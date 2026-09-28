"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { consumeRateLimit, getClientKey } from "@/lib/rate-limit";
import { mapCheckInError, CHECK_IN_SUCCESS } from "@/lib/checkin-messages";
import type { ActionState, CheckInResult } from "@/lib/types";

export type MemberMatch = {
  id: string;
  name: string;
  class_group_name: string | null;
};

export type SearchResult = {
  members: MemberMatch[];
  state: ActionState;
};

export type CheckInSuccess = {
  memberName: string;
  remainingCount: number;
  endDate: string;
};

export type CheckInActionState = ActionState & {
  success?: CheckInSuccess;
};

// 입구 키오스크 1대에서 모든 회원이 쓰므로 IP 하나에 트래픽이 몰린다.
// 무차별 4자리 열거 속도만 낮추면 되므로 한도를 넉넉히 잡는다.
const SEARCH_LIMIT = 40;
const CHECK_IN_LIMIT = 30;
const WINDOW_MS = 60_000;

/** 전화번호 뒤 4자리로 회원을 찾는다. 4자리가 아니면 조회하지 않는다. */
export async function searchMembers(last4: string): Promise<SearchResult> {
  const digits = last4.replace(/\D/g, "");

  if (digits.length !== 4) {
    return { members: [], state: { status: "idle", message: "" } };
  }

  const key = await getClientKey();
  if (!consumeRateLimit(`search:${key}`, SEARCH_LIMIT, WINDOW_MS)) {
    return {
      members: [],
      state: {
        status: "warn",
        message: "잠시 후 다시 시도해 주세요.",
      },
    };
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("members")
    .select("id, name, class_groups(name)")
    .eq("phone_last4", digits)
    .eq("status", "active")
    .order("name");

  if (error) {
    return {
      members: [],
      state: {
        status: "error",
        message: "조회 중 오류가 발생했습니다. 데스크에 문의해 주세요.",
      },
    };
  }

  const members: MemberMatch[] = (data ?? []).map((row) => {
    // 조인 결과는 Supabase 설정에 따라 객체 또는 1건짜리 배열로 온다.
    const group = row.class_groups as
      | { name: string }
      | { name: string }[]
      | null;
    const groupName = Array.isArray(group) ? group[0]?.name : group?.name;
    return {
      id: row.id as string,
      name: row.name as string,
      class_group_name: groupName ?? null,
    };
  });

  if (members.length === 0) {
    return {
      members,
      state: {
        status: "error",
        message: "일치하는 회원이 없습니다. 데스크에 문의해 주세요.",
      },
    };
  }

  return { members, state: { status: "idle", message: "" } };
}

/** 회원을 선택하면 출석 처리. 차감·중복방지는 전부 check_in_member() RPC 안에서 한다. */
export async function checkIn(
  memberId: string,
  memberName: string,
): Promise<CheckInActionState> {
  const key = await getClientKey();
  if (!consumeRateLimit(`checkin:${key}`, CHECK_IN_LIMIT, WINDOW_MS)) {
    return { status: "warn", message: "잠시 후 다시 시도해 주세요." };
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc("check_in_member", {
    p_member_id: memberId,
  });

  if (error) {
    const mapped = mapCheckInError(error.message);
    return { status: mapped.status, message: mapped.message };
  }

  const result = (Array.isArray(data) ? data[0] : data) as
    | CheckInResult
    | undefined;

  if (!result) {
    const mapped = mapCheckInError(null);
    return { status: mapped.status, message: mapped.message };
  }

  return {
    status: "success",
    message: CHECK_IN_SUCCESS,
    success: {
      memberName,
      remainingCount: result.remaining_count,
      endDate: result.end_date,
    },
  };
}
