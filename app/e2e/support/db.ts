import { createClient } from "@supabase/supabase-js";
import { SERVICE_ROLE_KEY, SUPABASE_URL } from "../../test-db/config.mjs";
import { addDays, todayKst } from "../../lib/format";

// 테스트가 로컬 테스트 DB를 직접 만지는 도구. 앱과 같은 supabase-js·service role 경로를 쓴다.
// 여기서 만드는 이름·전화번호는 전부 가짜다(010-0000-xxxx 대역).

export const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function must<T>(result: { data: T | null; error: { message: string } | null }, label: string): T {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data as T;
}

/** 모든 테이블을 비운다. FK 순서대로 지운다. */
export async function resetDb() {
  for (const table of ["checkin_requests", "attendance", "entitlements", "members", "plans", "class_groups"]) {
    const key = table === "checkin_requests" ? "request_id" : "id";
    must(await db.from(table).delete().not(key, "is", null), `reset ${table}`);
  }
}

export async function createGroup(name = "예시반") {
  return must(
    await db.from("class_groups").insert({ name, sort_order: 10 }).select("id, name").single(),
    "createGroup",
  ) as { id: string; name: string };
}

export async function createPlan(
  overrides: Partial<{ name: string; plan_type: "monthly" | "daily"; monthly_limit: number; duration_days: number; price: number }> = {},
) {
  return must(
    await db
      .from("plans")
      .insert({
        name: "예시 요금제",
        plan_type: "monthly",
        monthly_limit: 8,
        duration_days: 30,
        price: 100000,
        ...overrides,
      })
      .select("id, name, monthly_limit, duration_days")
      .single(),
    "createPlan",
  ) as { id: string; name: string; monthly_limit: number; duration_days: number };
}

let phoneSeq = 0;

/** 가짜 회원. last4를 주면 그 뒤 4자리로 만든다(중복 번호 시나리오용). */
export async function createMember(
  opts: { name?: string; last4?: string; groupId?: string | null; status?: string } = {},
) {
  phoneSeq += 1;
  const last4 = opts.last4 ?? String(1000 + (phoneSeq % 9000)).padStart(4, "0");
  const middle = String(phoneSeq).padStart(4, "0");
  const phone = `010${middle}${last4}`;
  return must(
    await db
      .from("members")
      .insert({
        name: opts.name ?? `가상회원${phoneSeq}`,
        phone,
        phone_last4: last4,
        class_group_id: opts.groupId ?? null,
        status: opts.status ?? "active",
      })
      .select("id, name, phone, phone_last4")
      .single(),
    "createMember",
  ) as { id: string; name: string; phone: string; phone_last4: string };
}

/** 수강권. 날짜는 KST 오늘 기준 상대 일수로 준다. */
export async function grantEntitlement(opts: {
  memberId: string;
  planId: string;
  startOffset?: number;
  endOffset?: number;
  remaining?: number;
  status?: "active" | "expired" | "used_up" | "cancelled";
}) {
  const today = todayKst();
  return must(
    await db
      .from("entitlements")
      .insert({
        member_id: opts.memberId,
        plan_id: opts.planId,
        start_date: addDays(today, opts.startOffset ?? -1),
        end_date: addDays(today, opts.endOffset ?? 28),
        remaining_count: opts.remaining ?? 8,
        status: opts.status ?? "active",
      })
      .select("id, end_date, remaining_count")
      .single(),
    "grantEntitlement",
  ) as { id: string; end_date: string; remaining_count: number };
}

export async function getEntitlement(id: string) {
  return must(
    await db.from("entitlements").select("remaining_count, status, end_date").eq("id", id).single(),
    "getEntitlement",
  ) as { remaining_count: number; status: string; end_date: string };
}

export async function countAttendance(memberId: string) {
  const { count, error } = await db
    .from("attendance")
    .select("id", { count: "exact", head: true })
    .eq("member_id", memberId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/**
 * 회원의 출석 기록을 과거로 민다 — "15분이 지난 뒤"를 기다리지 않고 만들기 위해.
 * 시각만 옮기고 횟수·수강권은 건드리지 않는다.
 */
export async function ageAttendance(memberId: string, minutes: number) {
  const rows = must(
    await db.from("attendance").select("id, checkin_time").eq("member_id", memberId),
    "ageAttendance select",
  ) as { id: string; checkin_time: string }[];
  for (const row of rows) {
    const shifted = new Date(new Date(row.checkin_time).getTime() - minutes * 60_000).toISOString();
    must(await db.from("attendance").update({ checkin_time: shifted }).eq("id", row.id), "ageAttendance update");
  }
}

/** 테스트 프록시에 장애를 건다. pathIncludes가 맞는 요청은 응답 없이 끊긴다. */
export async function setNetworkFault(down: boolean, pathIncludes = "") {
  const res = await fetch(`${SUPABASE_URL}/__fault`, {
    method: "POST",
    body: JSON.stringify({ down, pathIncludes }),
  });
  if (!res.ok) throw new Error(`fault 설정 실패: ${res.status}`);
}

export { addDays, todayKst };
