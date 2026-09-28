// 스키마·RPC 점검. 마이그레이션을 돌린 뒤 앱을 띄우기 전에 한 번 실행한다.
//
//   node --env-file=.env.local scripts/smoke.mjs
//
// 읽기 확인이 기본이고, --write를 붙이면 임시 회원을 만들어
// 출석 등록·취소까지 한 바퀴 돌린 뒤 흔적을 지운다.
// service role 키를 쓰므로 운영 DB에 --write를 쓸 때는 결과를 꼭 확인할 것.

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const WRITE = process.argv.includes("--write");
let failed = 0;

function report(label, okOrMessage) {
  const ok = okOrMessage === true;
  if (!ok) failed += 1;
  console.log(`${ok ? "  OK  " : "  실패"} ${label}${ok ? "" : ` — ${okOrMessage}`}`);
}

async function expectColumns(table, columns) {
  for (const column of columns) {
    const { error } = await supabase.from(table).select(column).limit(1);
    report(`${table}.${column}`, error ? error.message.slice(0, 70) : true);
  }
}

console.log("=== 001 · 003 스키마 ===");
await expectColumns("members", ["phone_last4", "status", "class_group_id"]);
await expectColumns("attendance", ["attendance_date", "source", "class_group_id"]);
await expectColumns("entitlements", ["remaining_count", "status", "memo"]);
await expectColumns("plans", ["plan_type", "monthly_limit", "duration_days", "price", "is_active"]);
{
  const { error } = await supabase.from("class_groups").select("id").limit(1);
  report("class_groups 테이블", error ? error.message.slice(0, 70) : true);
}
{
  const { error } = await supabase.from("retention_targets").select("member_id").limit(1);
  report("retention_targets 뷰", error ? error.message.slice(0, 70) : true);
}

console.log("\n=== 004 정리 ===");
{
  const { error } = await supabase.from("admin_profiles").select("id").limit(1);
  report("admin_profiles 제거됨", error ? true : "아직 남아 있음 — 004 미적용");
}

console.log("\n=== RPC 존재 여부 ===");
const NOWHERE = "00000000-0000-0000-0000-000000000000";
for (const [fn, args] of [
  ["check_in_member", { p_member_id: NOWHERE }],
  ["admin_add_attendance", { p_member_id: NOWHERE, p_date: null }],
  ["admin_cancel_attendance", { p_attendance_id: NOWHERE }],
]) {
  const { error } = await supabase.rpc(fn, args);
  const missing =
    error?.code === "PGRST202" ||
    /could not find the function/i.test(error?.message ?? "");
  report(`${fn}()`, missing ? "함수 없음 — 마이그레이션 필요" : true);
}

console.log("\n=== 004 오류코드 ===");
{
  // 004부터는 없는 회원에 대해 CHECK_IN_MEMBER_NOT_FOUND를 던진다.
  // 그 전 버전은 다른 문구를 뱉으므로 이걸로 적용 여부를 판별한다.
  const { error } = await supabase.rpc("check_in_member", { p_member_id: NOWHERE });
  const message = error?.message ?? "";
  report(
    "check_in_member 최신본(004)",
    message.includes("CHECK_IN_MEMBER_NOT_FOUND")
      ? true
      : `구버전으로 보임 — "${message.slice(0, 50)}"`,
  );
}

if (!WRITE) {
  console.log(
    `\n${failed === 0 ? "모두 통과" : `${failed}건 실패`} — 쓰기 경로까지 보려면 --write`,
  );
  process.exit(failed === 0 ? 0 : 1);
}

console.log("\n=== 쓰기 한 바퀴 (임시 데이터, 끝나면 삭제) ===");

const stamp = Date.now().toString().slice(-8);
const phone = `010${stamp}`;
let memberId = null;

try {
  const { data: plan } = await supabase
    .from("plans")
    .select("id, duration_days, monthly_limit")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (!plan) throw new Error("판매중인 요금제가 없다");

  const { data: member, error: memberError } = await supabase
    .from("members")
    .insert({
      name: `_스모크${stamp}`,
      phone,
      phone_last4: phone.slice(-4),
    })
    .select("id")
    .single();
  if (memberError) throw new Error(`회원 생성: ${memberError.message}`);
  memberId = member.id;
  report("회원 생성", true);

  const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  const end = new Date(Date.now() + 9 * 3600_000 + 29 * 86400_000)
    .toISOString()
    .slice(0, 10);

  const { error: entError } = await supabase.from("entitlements").insert({
    member_id: memberId,
    plan_id: plan.id,
    start_date: today,
    end_date: end,
    remaining_count: plan.monthly_limit,
    status: "active",
  });
  if (entError) throw new Error(`수강권 부여: ${entError.message}`);
  report("수강권 부여", true);

  const { data: added, error: addError } = await supabase.rpc("admin_add_attendance", {
    p_member_id: memberId,
    p_date: today,
  });
  if (addError) throw new Error(`수동 출석: ${addError.message}`);
  const addedRow = Array.isArray(added) ? added[0] : added;
  report(
    `수동 출석 등록 (잔여 ${plan.monthly_limit} → ${addedRow.remaining_count})`,
    addedRow.remaining_count === plan.monthly_limit - 1 ? true : "횟수 차감이 맞지 않음",
  );

  const { error: dupError } = await supabase.rpc("admin_add_attendance", {
    p_member_id: memberId,
    p_date: today,
  });
  report(
    "같은 날 중복 차단",
    dupError?.message.includes("ATTENDANCE_DUPLICATE_DATE")
      ? true
      : `막히지 않았다 — ${dupError?.message ?? "오류 없음"}`,
  );

  const { data: attendanceRow } = await supabase
    .from("attendance")
    .select("id")
    .eq("member_id", memberId)
    .limit(1)
    .single();

  const { data: cancelled, error: cancelError } = await supabase.rpc(
    "admin_cancel_attendance",
    { p_attendance_id: attendanceRow.id },
  );
  if (cancelError) throw new Error(`출석 취소: ${cancelError.message}`);
  const cancelledRow = Array.isArray(cancelled) ? cancelled[0] : cancelled;
  report(
    `출석 취소 + 횟수 복구 (→ ${cancelledRow.remaining_count})`,
    cancelledRow.remaining_count === plan.monthly_limit ? true : "복구된 횟수가 맞지 않음",
  );

  const { error: checkInError } = await supabase.rpc("check_in_member", {
    p_member_id: memberId,
  });
  report("QR 체크인", checkInError ? checkInError.message.slice(0, 60) : true);

  const { error: cooldownError } = await supabase.rpc("check_in_member", {
    p_member_id: memberId,
  });
  report(
    "15분 쿨다운",
    cooldownError?.message.includes("CHECK_IN_COOLDOWN")
      ? true
      : `막히지 않았다 — ${cooldownError?.message ?? "오류 없음"}`,
  );
} catch (error) {
  report("쓰기 경로", error.message);
} finally {
  if (memberId) {
    // attendance·entitlements는 member에 on delete cascade로 붙어 있다.
    await supabase.from("members").delete().eq("id", memberId);
    console.log("  임시 데이터 삭제 완료");
  }
}

console.log(`\n${failed === 0 ? "모두 통과" : `${failed}건 실패`}`);
process.exit(failed === 0 ? 0 : 1);
