"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  isAdminSignedIn,
  requireAdmin,
  signInAdmin,
  signOutAdmin,
} from "@/lib/admin-session";
import { consumeRateLimit, getClientKey } from "@/lib/rate-limit";
import { addDays, normalizePhone, todayKst } from "@/lib/format";
import { mapCheckInError } from "@/lib/checkin-messages";
import type { ActionState } from "@/lib/types";

// 관리자 쓰기 동작. 모든 함수가 requireAdmin()을 먼저 통과한다.
// 화면 렌더 분기(isAdminSignedIn)와 별개로, 액션 자체를 반드시 막아야 한다 —
// 서버 액션은 URL만 알면 직접 호출할 수 있다.

function ok(message: string): ActionState {
  return { status: "success", message };
}

function fail(message: string): ActionState {
  return { status: "error", message };
}

/** 액션 공통 래퍼: 인증 확인 + 예외를 배너 문구로 변환 + 화면 갱신 */
async function guarded(
  run: () => Promise<ActionState>,
  revalidate = "/admin",
): Promise<ActionState> {
  try {
    await requireAdmin();
    const result = await run();
    revalidatePath(revalidate);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "ADMIN_UNAUTHORIZED") {
      return fail("로그인이 만료되었습니다. 다시 로그인해 주세요.");
    }
    return fail(message || "처리 중 오류가 발생했습니다.");
  }
}

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function integer(formData: FormData, key: string) {
  const raw = text(formData, key);
  if (raw === "") return null;
  const parsed = Number(raw);
  return Number.isInteger(parsed) ? parsed : null;
}

// ── 로그인 ──────────────────────────────────────────────────────────────────

export async function signIn(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  // 비밀번호가 4자리라 무차별 대입이 현실적이다. 시도 횟수를 조인다.
  const key = await getClientKey();
  if (!consumeRateLimit(`admin-login:${key}`, 8, 5 * 60_000)) {
    return fail("로그인 시도가 많습니다. 5분 후 다시 시도해 주세요.");
  }

  const password = text(formData, "password");
  if (!(await signInAdmin(password))) {
    return fail("비밀번호가 맞지 않습니다.");
  }

  revalidatePath("/admin");
  return ok("로그인되었습니다.");
}

export async function signOut() {
  await signOutAdmin();
  revalidatePath("/admin");
}

// ── 회원 ────────────────────────────────────────────────────────────────────

export async function createMember(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return guarded(async () => {
    const name = text(formData, "name");
    const phone = normalizePhone(text(formData, "phone"));
    const classGroupId = text(formData, "class_group_id");

    if (!name) return fail("이름을 입력해 주세요.");
    if (phone.length < 10) {
      return fail("연락처를 010으로 시작하는 번호로 입력해 주세요.");
    }

    const supabase = createSupabaseServerClient();
    const { error } = await supabase.from("members").insert({
      name,
      phone,
      phone_last4: phone.slice(-4),
      class_group_id: classGroupId || null,
      join_date: text(formData, "join_date") || todayKst(),
      notes: text(formData, "notes") || null,
    });

    if (error) {
      if (error.code === "23505") {
        return fail("이미 등록된 연락처입니다.");
      }
      return fail("회원 등록에 실패했습니다.");
    }

    return ok(`${name} 회원을 등록했습니다.`);
  }, "/admin/members");
}

export async function updateMember(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return guarded(async () => {
    const id = text(formData, "id");
    const name = text(formData, "name");
    const phone = normalizePhone(text(formData, "phone"));
    const status = text(formData, "status");

    if (!id) return fail("대상 회원을 찾을 수 없습니다.");
    if (!name) return fail("이름을 입력해 주세요.");
    if (phone.length < 10) {
      return fail("연락처를 010으로 시작하는 번호로 입력해 주세요.");
    }

    const supabase = createSupabaseServerClient();
    const { error } = await supabase
      .from("members")
      .update({
        name,
        phone,
        phone_last4: phone.slice(-4),
        class_group_id: text(formData, "class_group_id") || null,
        status,
        notes: text(formData, "notes") || null,
      })
      .eq("id", id);

    if (error) {
      if (error.code === "23505") return fail("이미 등록된 연락처입니다.");
      return fail("회원 정보 수정에 실패했습니다.");
    }

    return ok(`${name} 회원 정보를 수정했습니다.`);
  }, "/admin/members");
}

// ── 수강권 ──────────────────────────────────────────────────────────────────

export async function grantEntitlement(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return guarded(async () => {
    const memberId = text(formData, "member_id");
    const planId = text(formData, "plan_id");
    const startDate = text(formData, "start_date") || todayKst();

    if (!memberId) return fail("회원을 선택해 주세요.");
    if (!planId) return fail("수강권 상품을 선택해 주세요.");

    const supabase = createSupabaseServerClient();
    const { data: plan } = await supabase
      .from("plans")
      .select("name, monthly_limit, duration_days")
      .eq("id", planId)
      .maybeSingle();

    if (!plan) return fail("선택한 수강권 상품을 찾을 수 없습니다.");

    // 상품 기본값을 쓰되, 특별 조건(연장·서비스 횟수)은 입력값으로 덮어쓴다.
    const count = integer(formData, "remaining_count") ?? plan.monthly_limit;
    const days = integer(formData, "duration_days") ?? plan.duration_days;

    if (count < 0) return fail("횟수는 0 이상이어야 합니다.");
    if (days < 1) return fail("이용 기간은 1일 이상이어야 합니다.");

    const { error } = await supabase.from("entitlements").insert({
      member_id: memberId,
      plan_id: planId,
      start_date: startDate,
      // 시작일 포함 N일이므로 하루를 뺀다.
      end_date: addDays(startDate, days - 1),
      remaining_count: count,
      status: "active",
      memo: text(formData, "memo") || null,
    });

    if (error) return fail("수강권 부여에 실패했습니다.");

    return ok(`${plan.name} 수강권을 부여했습니다.`);
  }, "/admin/entitlements");
}

export async function adjustEntitlement(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return guarded(async () => {
    const id = text(formData, "id");
    const count = integer(formData, "remaining_count");
    const startDate = text(formData, "start_date");
    const endDate = text(formData, "end_date");

    if (!id) return fail("대상 수강권을 찾을 수 없습니다.");
    if (count === null || count < 0) {
      return fail("남은 횟수를 0 이상의 숫자로 입력해 주세요.");
    }
    if (!startDate || !endDate) return fail("이용 기간을 입력해 주세요.");
    if (endDate < startDate) {
      return fail("종료일이 시작일보다 빠릅니다.");
    }

    // 횟수를 되살렸는데 상태가 used_up이면 다시 쓸 수 있게 열어준다.
    const status =
      count > 0 && endDate >= todayKst() ? "active" : undefined;

    const supabase = createSupabaseServerClient();
    const { error } = await supabase
      .from("entitlements")
      .update({
        remaining_count: count,
        start_date: startDate,
        end_date: endDate,
        ...(status ? { status } : {}),
      })
      .eq("id", id)
      .in("status", ["active", "used_up", "expired"]);

    if (error) return fail("수강권 정정에 실패했습니다.");

    return ok("수강권을 정정했습니다.");
  }, "/admin/entitlements");
}

export async function cancelEntitlement(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return guarded(async () => {
    const id = text(formData, "id");
    if (!id) return fail("대상 수강권을 찾을 수 없습니다.");

    const supabase = createSupabaseServerClient();
    const { error } = await supabase
      .from("entitlements")
      .update({ status: "cancelled" })
      .eq("id", id);

    if (error) return fail("수강권 취소에 실패했습니다.");

    return ok("수강권을 취소했습니다. 이미 기록된 출석은 그대로 남습니다.");
  }, "/admin/entitlements");
}

// ── 상품(수강료) ────────────────────────────────────────────────────────────

export async function savePlan(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return guarded(async () => {
    const id = text(formData, "id");
    const name = text(formData, "name");
    const planType = text(formData, "plan_type");
    const monthlyLimit = integer(formData, "monthly_limit");
    const durationDays = integer(formData, "duration_days");
    const price = integer(formData, "price");

    if (!name) return fail("상품 이름을 입력해 주세요.");
    if (planType !== "monthly" && planType !== "daily") {
      return fail("상품 종류를 선택해 주세요.");
    }
    if (monthlyLimit === null || monthlyLimit < 0) {
      return fail("횟수를 0 이상의 숫자로 입력해 주세요.");
    }
    if (durationDays === null || durationDays < 1) {
      return fail("이용 기간을 1일 이상으로 입력해 주세요.");
    }
    if (price === null || price < 0) {
      return fail("가격을 0 이상의 숫자로 입력해 주세요.");
    }

    const supabase = createSupabaseServerClient();
    const values = {
      name,
      plan_type: planType,
      monthly_limit: monthlyLimit,
      duration_days: durationDays,
      price,
      is_active: formData.get("is_active") === "on",
    };

    const { error } = id
      ? await supabase.from("plans").update(values).eq("id", id)
      : await supabase.from("plans").insert(values);

    if (error) {
      if (error.code === "23505") return fail("같은 이름의 상품이 이미 있습니다.");
      return fail("상품 저장에 실패했습니다.");
    }

    return ok(id ? `${name} 상품을 수정했습니다.` : `${name} 상품을 추가했습니다.`);
  }, "/admin/plans");
}

// ── 반 관리 ─────────────────────────────────────────────────────────────────

export async function saveClassGroup(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return guarded(async () => {
    const id = text(formData, "id");
    const name = text(formData, "name");
    const sortOrder = integer(formData, "sort_order") ?? 0;

    if (!name) return fail("반 이름을 입력해 주세요.");

    const supabase = createSupabaseServerClient();
    const values = {
      name,
      sort_order: sortOrder,
      is_active: formData.get("is_active") === "on",
    };

    const { error } = id
      ? await supabase.from("class_groups").update(values).eq("id", id)
      : await supabase.from("class_groups").insert(values);

    if (error) {
      if (error.code === "23505") return fail("같은 이름의 반이 이미 있습니다.");
      return fail("반 저장에 실패했습니다.");
    }

    return ok(id ? `${name} 반을 수정했습니다.` : `${name} 반을 추가했습니다.`);
  }, "/admin/groups");
}

// ── 출석부 ──────────────────────────────────────────────────────────────────

export async function addAttendance(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return guarded(async () => {
    const memberId = text(formData, "member_id");
    const date = text(formData, "attendance_date") || todayKst();

    if (!memberId) return fail("회원을 선택해 주세요.");
    if (date > todayKst()) return fail("미래 날짜는 등록할 수 없습니다.");

    const supabase = createSupabaseServerClient();
    const { error } = await supabase.rpc("admin_add_attendance", {
      p_member_id: memberId,
      p_date: date,
    });

    if (error) {
      if (error.message.includes("ATTENDANCE_DUPLICATE_DATE")) {
        return fail("해당 날짜에 이미 출석 기록이 있습니다.");
      }
      if (error.message.includes("ATTENDANCE_FUTURE_DATE")) {
        return fail("미래 날짜는 등록할 수 없습니다.");
      }
      const mapped = mapCheckInError(error.message);
      return { status: mapped.status, message: mapped.message };
    }

    return ok("출석을 등록했습니다.");
  }, "/admin/attendance");
}

export async function cancelAttendance(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return guarded(async () => {
    const id = text(formData, "id");
    if (!id) return fail("대상 출석 기록을 찾을 수 없습니다.");

    const supabase = createSupabaseServerClient();
    const { error } = await supabase.rpc("admin_cancel_attendance", {
      p_attendance_id: id,
    });

    if (error) {
      if (error.message.includes("ATTENDANCE_NOT_FOUND")) {
        return fail("이미 취소된 출석입니다.");
      }
      return fail("출석 취소에 실패했습니다.");
    }

    return ok("출석을 취소하고 횟수를 되돌렸습니다.");
  }, "/admin/attendance");
}

/** 화면에서 세션 상태를 확인할 때 쓴다. */
export async function checkAdminSession() {
  return isAdminSignedIn();
}
