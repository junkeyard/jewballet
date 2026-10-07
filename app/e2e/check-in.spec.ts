import { codeInput, expect, test } from "./support/fixtures";
import {
  ageAttendance,
  countAttendance,
  createGroup,
  createMember,
  createPlan,
  getEntitlement,
  grantEntitlement,
  setNetworkFault,
} from "./support/db";
import { formatDate } from "../lib/format";

// /check-in 현재 동작 고정. 문구는 design.md 6.5 매핑과 lib/checkin-messages.ts가 원본이다.

const MSG = {
  success: "출석이 완료되었습니다.",
  cooldown: "방금 출석 처리되었습니다. 잠시 후 다시 시도해 주세요.",
  notFound: "일치하는 회원이 없습니다. 데스크에 문의해 주세요.",
  noEntitlement: "사용 가능한 수강권이 없습니다. 수강권 등록 후 이용 가능합니다.",
  noRemaining: "남은 횟수가 없습니다. 재등록 후 이용 가능합니다.",
  expired: "이용 기간이 종료되었습니다. 재등록 후 이용 가능합니다.",
  notStarted: "수강권 시작일 이전입니다. 시작일부터 이용 가능합니다.",
  fallback: "출석 처리 중 오류가 발생했습니다. 데스크에 문의해 주세요.",
  searchError: "조회 중 오류가 발생했습니다. 데스크에 문의해 주세요.",
  lastCount: "이번 수강권의 마지막 횟수였습니다. 재등록 후 이용 가능합니다.",
};

async function setup(opts: { remaining?: number; endOffset?: number; startOffset?: number; status?: "active" | "expired" | "used_up" | "cancelled"; last4?: string; name?: string } = {}) {
  const group = await createGroup("예시 저녁반");
  const plan = await createPlan({ monthly_limit: 8 });
  const member = await createMember({ name: opts.name ?? "가상회원 하나", last4: opts.last4 ?? "2468", groupId: group.id });
  const entitlement = await grantEntitlement({
    memberId: member.id,
    planId: plan.id,
    remaining: opts.remaining ?? 8,
    endOffset: opts.endOffset ?? 28,
    startOffset: opts.startOffset ?? -1,
    status: opts.status ?? "active",
  });
  return { group, plan, member, entitlement };
}

test.describe("체크인 성공 경로", () => {
  test("4자리 입력 → 본인 선택 → 출석 완료 카드, 1회 차감", async ({ page }) => {
    const { member, entitlement } = await setup({ remaining: 8 });

    await page.goto("/check-in");
    await expect(page.getByRole("heading", { name: "전화번호 뒤 4자리로 출석 체크" })).toBeVisible();

    await codeInput(page).fill(member.phone_last4);
    const pick = page.getByRole("button", { name: /가상회원 하나/ });
    await expect(pick).toBeVisible();
    await expect(pick).toContainText("예시 저녁반");
    await expect(page.getByText("본인을 선택해 주세요. 눌러서 바로 체크인")).toBeVisible();

    await pick.click();

    await expect(page.getByRole("status").filter({ hasText: MSG.success })).toBeVisible();
    await expect(page.getByText("가상회원 하나님")).toBeVisible();
    await expect(page.getByRole("heading", { name: "오늘 출석 완료" })).toBeVisible();
    await expect(page.locator(".stat-value").first()).toHaveText("7");
    await expect(page.getByText(`${formatDate(entitlement.end_date)}까지`)).toBeVisible();

    expect((await getEntitlement(entitlement.id)).remaining_count).toBe(7);
    expect(await countAttendance(member.id)).toBe(1);

    // "다음 사람 체크인"은 입력 화면으로 되돌린다.
    await page.getByRole("button", { name: "다음 사람 체크인" }).click();
    await expect(codeInput(page)).toHaveValue("");
    await expect(codeInput(page)).toBeFocused();
  });

  test("숫자 외 문자는 버리고 4자리까지만 받는다, 덜 치면 안내만", async ({ page }) => {
    await page.goto("/check-in");
    await codeInput(page).pressSequentially("1a2");
    await expect(codeInput(page)).toHaveValue("12");
    await expect(page.getByText("4자리를 모두 입력하면 자동으로 찾습니다.")).toBeVisible();
    await codeInput(page).pressSequentially("3456");
    await expect(codeInput(page)).toHaveValue("1234");
  });

  test("마지막 1회를 쓰면 재등록 안내가 함께 뜬다", async ({ page }) => {
    const { member, entitlement } = await setup({ remaining: 1 });
    await page.goto("/check-in");
    await codeInput(page).fill(member.phone_last4);
    await page.getByRole("button", { name: /가상회원 하나/ }).click();

    await expect(page.getByRole("status").filter({ hasText: MSG.success })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: MSG.lastCount })).toBeVisible();
    expect(await getEntitlement(entitlement.id)).toMatchObject({ remaining_count: 0, status: "used_up" });
  });

  test("만료 7일 이내면 종료일 안내가 함께 뜬다", async ({ page }) => {
    const { member, entitlement } = await setup({ remaining: 5, endOffset: 3 });
    await page.goto("/check-in");
    await codeInput(page).fill(member.phone_last4);
    await page.getByRole("button", { name: /가상회원 하나/ }).click();

    await expect(
      page.getByRole("status").filter({
        hasText: `이용 기간이 ${formatDate(entitlement.end_date)}에 종료됩니다. 재등록을 준비해 주세요.`,
      }),
    ).toBeVisible();
    await expect(page.getByText("D-3")).toBeVisible();
  });
});

test.describe("체크인 실패 경로", () => {
  test("미등록 번호", async ({ page }) => {
    await setup({ last4: "2468" });
    await page.goto("/check-in");
    await codeInput(page).fill("9999");
    await expect(page.getByRole("status").filter({ hasText: MSG.notFound })).toBeVisible();
    await expect(page.getByRole("button", { name: /가상회원/ })).toHaveCount(0);
  });

  test("활동중이 아닌 회원은 검색되지 않는다", async ({ page }) => {
    await createMember({ name: "가상회원 휴면", last4: "5555", status: "dormant" });
    await page.goto("/check-in");
    await codeInput(page).fill("5555");
    await expect(page.getByRole("status").filter({ hasText: MSG.notFound })).toBeVisible();
  });

  test("뒤 4자리가 같은 회원 둘 — 목록에서 고른 사람만 차감된다", async ({ page }) => {
    const plan = await createPlan();
    const groupA = await createGroup("예시 오전반");
    const groupB = await createGroup("예시 저녁반");
    // 동명이인까지 겹치는 최악의 경우: 소속반으로만 구분된다.
    const a = await createMember({ name: "가상회원 동명", last4: "1001", groupId: groupA.id });
    const b = await createMember({ name: "가상회원 동명", last4: "1001", groupId: groupB.id });
    const entA = await grantEntitlement({ memberId: a.id, planId: plan.id, remaining: 8 });
    const entB = await grantEntitlement({ memberId: b.id, planId: plan.id, remaining: 8 });

    await page.goto("/check-in");
    await codeInput(page).fill("1001");
    const picks = page.getByRole("button", { name: /가상회원 동명/ });
    await expect(picks).toHaveCount(2);

    await picks.filter({ hasText: "예시 저녁반" }).click();
    await expect(page.getByRole("status").filter({ hasText: MSG.success })).toBeVisible();

    expect((await getEntitlement(entA.id)).remaining_count).toBe(8);
    expect((await getEntitlement(entB.id)).remaining_count).toBe(7);
  });

  test("수강권 없음", async ({ page }) => {
    const member = await createMember({ name: "가상회원 신규", last4: "3333" });
    await page.goto("/check-in");
    await codeInput(page).fill("3333");
    await page.getByRole("button", { name: /가상회원 신규/ }).click();
    await expect(page.getByRole("status").filter({ hasText: MSG.noEntitlement })).toBeVisible();
    expect(await countAttendance(member.id)).toBe(0);
  });

  test("잔여 0 (used_up)", async ({ page }) => {
    const { member } = await setup({ remaining: 0, status: "used_up" });
    await page.goto("/check-in");
    await codeInput(page).fill(member.phone_last4);
    await page.getByRole("button", { name: /가상회원 하나/ }).click();
    await expect(page.getByRole("status").filter({ hasText: MSG.noRemaining })).toBeVisible();
    expect(await countAttendance(member.id)).toBe(0);
  });

  test("기간 만료 — status가 active로 남아 있어도 expired로 정리된다(004)", async ({ page }) => {
    const { member, entitlement } = await setup({ startOffset: -40, endOffset: -1, remaining: 3 });
    await page.goto("/check-in");
    await codeInput(page).fill(member.phone_last4);
    await page.getByRole("button", { name: /가상회원 하나/ }).click();
    await expect(page.getByRole("status").filter({ hasText: MSG.expired })).toBeVisible();
    // 오류로 끝난 호출은 트랜잭션째 되돌려지므로 status 정리도 남지 않는다 — 현재 동작.
    expect(await getEntitlement(entitlement.id)).toMatchObject({ remaining_count: 3 });
    expect(await countAttendance(member.id)).toBe(0);
  });

  test("만료된 수강권이 있어도 새 수강권이 있으면 출석된다(004 재등록 버그 수정)", async ({ page }) => {
    const { member, plan } = await setup({ startOffset: -40, endOffset: -1, remaining: 3 });
    const renewed = await grantEntitlement({ memberId: member.id, planId: plan.id, remaining: 8 });
    await page.goto("/check-in");
    await codeInput(page).fill(member.phone_last4);
    await page.getByRole("button", { name: /가상회원 하나/ }).click();
    await expect(page.getByRole("status").filter({ hasText: MSG.success })).toBeVisible();
    expect((await getEntitlement(renewed.id)).remaining_count).toBe(7);
  });

  test("시작일 이전 수강권", async ({ page }) => {
    const { member } = await setup({ startOffset: 3, endOffset: 30 });
    await page.goto("/check-in");
    await codeInput(page).fill(member.phone_last4);
    await page.getByRole("button", { name: /가상회원 하나/ }).click();
    await expect(page.getByRole("status").filter({ hasText: MSG.notStarted })).toBeVisible();
  });

  test("네트워크 실패 — 회원 조회 단계", async ({ page }) => {
    const { member } = await setup();
    await setNetworkFault(true, "/members");
    await page.goto("/check-in");
    await codeInput(page).fill(member.phone_last4);
    await expect(page.getByRole("status").filter({ hasText: MSG.searchError })).toBeVisible();
  });

  test("네트워크 실패 — 출석 처리 단계, 차감 없음", async ({ page }) => {
    const { member, entitlement } = await setup({ remaining: 8 });
    await page.goto("/check-in");
    await codeInput(page).fill(member.phone_last4);
    const pick = page.getByRole("button", { name: /가상회원 하나/ });
    await expect(pick).toBeVisible();

    await setNetworkFault(true, "/rpc/check_in_member");
    await pick.click();
    await expect(page.getByRole("status").filter({ hasText: MSG.fallback })).toBeVisible();
    expect((await getEntitlement(entitlement.id)).remaining_count).toBe(8);

    // 복구 뒤 다시 누르면 정상 처리된다(목록이 그대로 남아 있다).
    await setNetworkFault(false);
    await pick.click();
    await expect(page.getByRole("status").filter({ hasText: MSG.success })).toBeVisible();
    expect((await getEntitlement(entitlement.id)).remaining_count).toBe(7);
  });
});

test.describe("알려진 결함 (고치면 test.fail을 지울 것)", () => {
  // 현재 동작: 폰 자체가 오프라인이면 서버 액션 fetch가 던진 예외를 잡지 않아
  // 화면 전체가 "Application error: a client-side exception…"으로 바뀐다(2026-09-28 확인).
  // 회원 화면 작업(S2)에서 행동 안내 배너로 바꿔야 한다. 그때 아래 test.fail()을 지운다.
  test("폰이 오프라인일 때 체크인을 누르면 화면이 깨지지 않고 안내가 뜬다", async ({ page, context }) => {
    test.fail(true, "알려진 결함: 오프라인 예외를 잡지 않아 화면 전체가 오류로 바뀐다");
    const { member, entitlement } = await setup({ remaining: 8 });
    await page.goto("/check-in");
    await codeInput(page).fill(member.phone_last4);
    const pick = page.getByRole("button", { name: /가상회원 하나/ });
    await expect(pick).toBeVisible();

    await context.setOffline(true);
    await pick.click();
    await context.setOffline(false);
    expect((await getEntitlement(entitlement.id)).remaining_count).toBe(8);
    await expect(page.getByText("Application error")).toHaveCount(0, { timeout: 3_000 });
    await expect(page.getByRole("status")).toBeVisible({ timeout: 3_000 });
  });
});

test.describe("반복 안정성·멱등성", () => {
  test("같은 회원이 곧바로 다시 스캔하면 두 번 차감하지 않는다", async ({ page }) => {
    const { member, entitlement } = await setup({ remaining: 8 });
    await page.goto("/check-in");

    await codeInput(page).fill(member.phone_last4);
    await page.getByRole("button", { name: /가상회원 하나/ }).click();
    await expect(page.getByRole("status").filter({ hasText: MSG.success })).toBeVisible();

    // 재스캔: QR을 다시 찍어 새로 연 것처럼 페이지를 다시 연다.
    await page.goto("/check-in");
    await codeInput(page).fill(member.phone_last4);
    await page.getByRole("button", { name: /가상회원 하나/ }).click();
    await expect(page.getByRole("status").filter({ hasText: MSG.cooldown })).toBeVisible();

    expect((await getEntitlement(entitlement.id)).remaining_count).toBe(7);
    expect(await countAttendance(member.id)).toBe(1);
  });

  test("연속 20회 재스캔(짧은 시간) — 1회만 차감, 오류 0건", async ({ page }) => {
    const { member, entitlement } = await setup({ remaining: 25 });
    const outcomes: string[] = [];

    for (let i = 0; i < 20; i += 1) {
      await page.goto("/check-in");
      await codeInput(page).fill(member.phone_last4);
      await page.getByRole("button", { name: /가상회원 하나/ }).click();
      const banner = page.getByRole("status").filter({ hasText: /출석이 완료|방금 출석|오류|없습니다|종료/ }).first();
      await expect(banner).toBeVisible();
      outcomes.push((await banner.textContent()) ?? "");
    }

    expect(outcomes.filter((t) => t.includes(MSG.success))).toHaveLength(1);
    expect(outcomes.filter((t) => t.includes(MSG.cooldown))).toHaveLength(19);
    expect(outcomes.filter((t) => t.includes("오류"))).toHaveLength(0);
    expect((await getEntitlement(entitlement.id)).remaining_count).toBe(24);
  });

  test("연속 20회 체크인(매번 15분 경과 가정) — 매번 정확히 1회씩 차감, 오류 0건", async ({ page }) => {
    test.setTimeout(180_000);
    const { member, entitlement } = await setup({ remaining: 25 });

    await page.goto("/check-in");
    for (let i = 0; i < 20; i += 1) {
      await ageAttendance(member.id, 16);
      await codeInput(page).fill(member.phone_last4);
      await page.getByRole("button", { name: /가상회원 하나/ }).click();
      await expect(page.getByRole("status").filter({ hasText: MSG.success })).toBeVisible();
      await expect(page.locator(".stat-value").first()).toHaveText(String(25 - i - 1));
      await page.getByRole("button", { name: "다음 사람 체크인" }).click();
    }

    expect((await getEntitlement(entitlement.id)).remaining_count).toBe(5);
    expect(await countAttendance(member.id)).toBe(20);
  });
});
