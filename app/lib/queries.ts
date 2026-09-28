import { createSupabaseServerClient } from "@/lib/supabase/server";
import { monthRange, todayKst } from "@/lib/format";
import type {
  Attendance,
  ClassGroup,
  Entitlement,
  Member,
  Plan,
  RetentionTarget,
} from "@/lib/types";

// 페이지에서 쓰는 읽기 질의를 모아둔다. 쓰기는 각 화면의 actions.ts에 둔다.

export type EntitlementWithPlan = Entitlement & {
  plans: Pick<Plan, "name" | "plan_type" | "monthly_limit"> | null;
};

/** 조인 결과가 객체 또는 1건짜리 배열로 오는 것을 하나로 맞춘다. */
export function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export async function getClassGroups(activeOnly = false) {
  const supabase = createSupabaseServerClient();
  let query = supabase.from("class_groups").select("*").order("sort_order");
  if (activeOnly) query = query.eq("is_active", true);
  const { data } = await query;
  return (data ?? []) as ClassGroup[];
}

export async function getPlans(activeOnly = false) {
  const supabase = createSupabaseServerClient();
  let query = supabase.from("plans").select("*").order("price", { ascending: false });
  if (activeOnly) query = query.eq("is_active", true);
  const { data } = await query;
  return (data ?? []) as Plan[];
}

export async function getMember(memberId: string) {
  const supabase = createSupabaseServerClient();
  const { data } = await supabase
    .from("members")
    .select("*, class_groups(name)")
    .eq("id", memberId)
    .maybeSingle();

  if (!data) return null;

  const group = one(data.class_groups as { name: string } | { name: string }[]);
  return {
    ...(data as unknown as Member),
    class_group_name: group?.name ?? null,
  };
}

/**
 * 지금 쓸 수 있는 수강권. 기간 안에 들어 있고 횟수가 남은 것 중
 * 먼저 끝나는 것을 고른다 — check_in_member()의 소진 순서와 같게 맞춘 것이다.
 */
export async function getActiveEntitlement(memberId: string) {
  const supabase = createSupabaseServerClient();
  const today = todayKst();
  const { data } = await supabase
    .from("entitlements")
    .select("*, plans(name, plan_type, monthly_limit)")
    .eq("member_id", memberId)
    .eq("status", "active")
    .lte("start_date", today)
    .gte("end_date", today)
    .gt("remaining_count", 0)
    .order("end_date", { ascending: true })
    .limit(1)
    .maybeSingle();

  return (data as EntitlementWithPlan | null) ?? null;
}

export async function getMemberEntitlements(memberId: string) {
  const supabase = createSupabaseServerClient();
  const { data } = await supabase
    .from("entitlements")
    .select("*, plans(name, plan_type, monthly_limit)")
    .eq("member_id", memberId)
    .order("start_date", { ascending: false });

  return (data ?? []) as EntitlementWithPlan[];
}

export async function getRecentAttendance(memberId: string, limit = 5) {
  const supabase = createSupabaseServerClient();
  const { data } = await supabase
    .from("attendance")
    .select("*")
    .eq("member_id", memberId)
    .order("checkin_time", { ascending: false })
    .limit(limit);

  return (data ?? []) as Attendance[];
}

/** 해당 월에 출석한 날짜만 'YYYY-MM-DD' 배열로 */
export async function getMonthlyAttendanceDates(
  memberId: string,
  year: number,
  month: number,
) {
  const supabase = createSupabaseServerClient();
  const { start, end } = monthRange(year, month);
  const { data } = await supabase
    .from("attendance")
    .select("attendance_date")
    .eq("member_id", memberId)
    .gte("attendance_date", start)
    .lte("attendance_date", end);

  return new Set((data ?? []).map((row) => row.attendance_date as string));
}

export async function getRetentionTargets() {
  const supabase = createSupabaseServerClient();
  const { data } = await supabase
    .from("retention_targets")
    .select("*")
    .not("retention_reason", "is", null)
    .order("last_attendance_date", { ascending: true, nullsFirst: true });

  return (data ?? []) as RetentionTarget[];
}
