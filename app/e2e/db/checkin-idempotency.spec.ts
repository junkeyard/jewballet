import { createClient } from "@supabase/supabase-js";
import { expect, test } from "../support/fixtures";
import {
  ageAttendance,
  countAttendance,
  createMember,
  createPlan,
  db,
  getEntitlement,
  grantEntitlement,
} from "../support/db";
import { ANON_KEY, SUPABASE_URL } from "../../test-db/config.mjs";

// DB 함수 수준의 멱등성·동시성 검증. 003→004→005→006이 적용된 로컬 Postgres에서 돈다.

async function memberWithTicket(remaining = 10) {
  const plan = await createPlan();
  const member = await createMember({ last4: "4040" });
  const ent = await grantEntitlement({ memberId: member.id, planId: plan.id, remaining });
  return { member, ent };
}

test.describe("check_in_member (004, 현재 앱이 쓰는 함수)", () => {
  test("동시에 20번 불러도 1번만 차감된다 — 나머지는 CHECK_IN_COOLDOWN", async () => {
    const { member, ent } = await memberWithTicket(10);
    const results = await Promise.all(
      Array.from({ length: 20 }, () => db.rpc("check_in_member", { p_member_id: member.id })),
    );
    const ok = results.filter((r) => !r.error);
    const cooldown = results.filter((r) => r.error?.message.includes("CHECK_IN_COOLDOWN"));
    expect(ok).toHaveLength(1);
    expect(cooldown).toHaveLength(19);
    expect((await getEntitlement(ent.id)).remaining_count).toBe(9);
    expect(await countAttendance(member.id)).toBe(1);
  });

  test("15분이 지나면 다시 차감된다", async () => {
    const { member, ent } = await memberWithTicket(10);
    expect((await db.rpc("check_in_member", { p_member_id: member.id })).error).toBeNull();
    await ageAttendance(member.id, 16);
    expect((await db.rpc("check_in_member", { p_member_id: member.id })).error).toBeNull();
    expect((await getEntitlement(ent.id)).remaining_count).toBe(8);
  });
});

test.describe("check_in_member_once (006, 추가형)", () => {
  test("같은 요청 ID 재전송 → 같은 출석을 돌려주고 차감 없음", async () => {
    const { member, ent } = await memberWithTicket(10);
    const requestId = crypto.randomUUID();
    const first = await db.rpc("check_in_member_once", { p_member_id: member.id, p_request_id: requestId });
    const again = await db.rpc("check_in_member_once", { p_member_id: member.id, p_request_id: requestId });

    expect(first.error).toBeNull();
    expect(again.error).toBeNull();
    expect(first.data[0]).toMatchObject({ remaining_count: 9, replayed: false });
    expect(again.data[0]).toMatchObject({
      attendance_id: first.data[0].attendance_id,
      remaining_count: 9,
      replayed: true,
    });
    expect((await getEntitlement(ent.id)).remaining_count).toBe(9);
  });

  test("요청 ID가 달라도 15분 안의 재스캔은 오류 없이 기존 출석을 돌려준다", async () => {
    const { member, ent } = await memberWithTicket(10);
    const first = await db.rpc("check_in_member_once", { p_member_id: member.id, p_request_id: crypto.randomUUID() });
    const rescan = await db.rpc("check_in_member_once", { p_member_id: member.id, p_request_id: crypto.randomUUID() });
    const noId = await db.rpc("check_in_member_once", { p_member_id: member.id });
    expect(rescan.error).toBeNull();
    expect(noId.error).toBeNull();
    expect(rescan.data[0]).toMatchObject({ attendance_id: first.data[0].attendance_id, replayed: true });
    expect(noId.data[0]).toMatchObject({ attendance_id: first.data[0].attendance_id, replayed: true });
    expect((await getEntitlement(ent.id)).remaining_count).toBe(9);
  });

  test("요청 ID 재전송은 15분이 지나도 다시 차감하지 않는다", async () => {
    const { member, ent } = await memberWithTicket(10);
    const requestId = crypto.randomUUID();
    await db.rpc("check_in_member_once", { p_member_id: member.id, p_request_id: requestId });
    await ageAttendance(member.id, 60);
    const replay = await db.rpc("check_in_member_once", { p_member_id: member.id, p_request_id: requestId });
    expect(replay.data[0]).toMatchObject({ replayed: true });
    expect((await getEntitlement(ent.id)).remaining_count).toBe(9);

    // 새 요청이면 새로 차감한다.
    const fresh = await db.rpc("check_in_member_once", { p_member_id: member.id, p_request_id: crypto.randomUUID() });
    expect(fresh.data[0]).toMatchObject({ replayed: false, remaining_count: 8 });
  });

  test("동시에 20번 → 정확히 1번만 새 출석, 나머지는 replayed", async () => {
    const { member, ent } = await memberWithTicket(10);
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        db.rpc("check_in_member_once", { p_member_id: member.id, p_request_id: crypto.randomUUID() }),
      ),
    );
    expect(results.every((r) => r.error === null)).toBe(true);
    expect(results.filter((r) => r.data[0].replayed === false)).toHaveLength(1);
    expect((await getEntitlement(ent.id)).remaining_count).toBe(9);
    expect(await countAttendance(member.id)).toBe(1);
  });

  test("실패 사유 오류코드는 기존 함수와 같다", async () => {
    const plan = await createPlan();
    const noTicket = await createMember({ last4: "5050" });
    const usedUp = await createMember({ last4: "6060" });
    await grantEntitlement({ memberId: usedUp.id, planId: plan.id, remaining: 0, status: "used_up" });

    const cases: [string, string][] = [
      [noTicket.id, "CHECK_IN_NO_ENTITLEMENT"],
      [usedUp.id, "CHECK_IN_NO_REMAINING_COUNT"],
      ["00000000-0000-0000-0000-000000000000", "CHECK_IN_MEMBER_NOT_FOUND"],
    ];
    for (const [memberId, code] of cases) {
      const { error } = await db.rpc("check_in_member_once", { p_member_id: memberId, p_request_id: crypto.randomUUID() });
      expect(error?.message).toContain(code);
    }
    // 실패한 요청은 기록되지 않는다(트랜잭션째 되돌려짐).
    const { count } = await db.from("checkin_requests").select("request_id", { count: "exact", head: true });
    expect(count).toBe(0);
  });

  test("anon 키로는 함수·테이블에 접근할 수 없다", async () => {
    const { member } = await memberWithTicket(10);
    const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    const rpc = await anon.rpc("check_in_member_once", { p_member_id: member.id });
    expect(rpc.error?.message).toMatch(/permission denied/);
    const table = await anon.from("checkin_requests").select("request_id");
    expect(table.error?.message).toMatch(/permission denied/);
  });
});
