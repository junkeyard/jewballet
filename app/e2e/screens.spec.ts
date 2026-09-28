import path from "node:path";
import type { Page, TestInfo } from "@playwright/test";
import { adminLogin, codeInput, expect, test } from "./support/fixtures";
import { createGroup, createMember, createPlan, db, grantEntitlement } from "./support/db";

// 폭별 스크린샷 + 가로 넘침 자동 검사.
//  · 모바일 프로젝트: 폭 360 · 390 · 430
//  · 데스크톱 프로젝트: 폭 1280
// 저장 위치: docs/screens/<프로젝트>/<화면>-<폭>.png (저장소 루트 기준)
//
// 자동 검사는 "페이지 가로 스크롤 없음"과 "화면 밖으로 삐져나간 요소 없음"(표·관리자 탭처럼 스스로
// 가로 스크롤을 갖는 영역 안은 제외)까지다. 겹침은 스크린샷을 사람이 보고 판단한다.

const SCREENS_DIR = path.resolve(__dirname, "..", "..", "docs", "screens");

function widthsFor(testInfo: TestInfo) {
  return testInfo.project.name.startsWith("mobile") ? [360, 390, 430] : [1280];
}

async function assertNoHorizontalOverflow(page: Page) {
  const report = await page.evaluate(() => {
    const vw = window.innerWidth;
    const pageScroll = document.documentElement.scrollWidth - vw;
    const offenders: string[] = [];
    for (const el of Array.from(document.body.querySelectorAll("*"))) {
      // 스스로 가로 스크롤을 갖는 영역(.table-scroll, 관리자 .tabs 등) 안의 요소는 그 영역이 책임진다.
      let scroller: Element | null = el.parentElement;
      let insideScroller = false;
      while (scroller && scroller !== document.body) {
        const overflowX = getComputedStyle(scroller).overflowX;
        if (overflowX === "auto" || overflowX === "scroll") {
          insideScroller = true;
          break;
        }
        scroller = scroller.parentElement;
      }
      if (insideScroller) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.right > vw + 1 || rect.left < -1) {
        offenders.push(`${el.tagName.toLowerCase()}.${(el as HTMLElement).className} (${Math.round(rect.left)}~${Math.round(rect.right)})`);
      }
    }
    return { pageScroll, offenders: offenders.slice(0, 5) };
  });
  expect(report.pageScroll, "페이지 가로 스크롤").toBeLessThanOrEqual(0);
  expect(report.offenders, "화면 밖으로 나간 요소").toEqual([]);
}

async function capture(page: Page, testInfo: TestInfo, name: string, prepare: () => Promise<void>) {
  for (const width of widthsFor(testInfo)) {
    await page.setViewportSize({ width, height: testInfo.project.name.startsWith("mobile") ? 844 : 800 });
    await prepare();
    await page.evaluate(() => document.fonts.ready);
    await assertNoHorizontalOverflow(page);
    await page.screenshot({
      path: path.join(SCREENS_DIR, testInfo.project.name, `${name}-${width}.png`),
      fullPage: true,
      animations: "disabled",
      caret: "hide",
    });
  }
}

async function seed() {
  const morning = await createGroup("예시 오전반");
  const evening = await createGroup("예시 저녁반");
  const plan = await createPlan({ name: "예시 요금제 주2회", monthly_limit: 8 });
  await createPlan({ name: "예시 일일권", plan_type: "daily", monthly_limit: 1, duration_days: 1, price: 20000 });

  const main = await createMember({ name: "가상회원 하나", last4: "2468", groupId: morning.id });
  const twinA = await createMember({ name: "가상회원 둘", last4: "1001", groupId: morning.id });
  const twinB = await createMember({ name: "가상회원 셋", last4: "1001", groupId: evening.id });
  const expiring = await createMember({ name: "가상회원 넷", last4: "3690", groupId: evening.id });

  await grantEntitlement({ memberId: main.id, planId: plan.id, remaining: 6, endOffset: 20 });
  await grantEntitlement({ memberId: twinA.id, planId: plan.id, remaining: 8 });
  await grantEntitlement({ memberId: twinB.id, planId: plan.id, remaining: 3, endOffset: 5 });
  await grantEntitlement({ memberId: expiring.id, planId: plan.id, remaining: 9, endOffset: 2 });
  await db.rpc("check_in_member", { p_member_id: twinA.id });
  await db.rpc("admin_add_attendance", { p_member_id: main.id, p_date: null });
  return { main };
}

test("회원 화면 스크린샷", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const { main } = await seed();

  await capture(page, testInfo, "home", async () => {
    await page.goto("/");
  });
  await capture(page, testInfo, "check-in", async () => {
    await page.goto("/check-in");
  });
  await capture(page, testInfo, "check-in-duplicate-last4", async () => {
    await page.goto("/check-in");
    await codeInput(page).fill("1001");
    await expect(page.getByRole("button", { name: /가상회원/ })).toHaveCount(2);
  });
  await capture(page, testInfo, "check-in-not-found", async () => {
    await page.goto("/check-in");
    await codeInput(page).fill("9999");
    await expect(page.getByRole("status")).toBeVisible();
  });
  await capture(page, testInfo, "check-in-success", async () => {
    // 폭마다 새로 체크인해야 하므로 직전 출석을 지워 쿨다운을 피한다.
    await db.from("attendance").delete().eq("member_id", (await db.from("members").select("id").eq("name", "가상회원 넷").single()).data!.id);
    await page.goto("/check-in");
    await codeInput(page).fill("3690");
    await page.getByRole("button", { name: /가상회원 넷/ }).click();
    await expect(page.getByRole("heading", { name: "오늘 출석 완료" })).toBeVisible();
  });
  await capture(page, testInfo, "member-lookup", async () => {
    await page.goto("/member");
  });
  await capture(page, testInfo, "member-detail", async () => {
    await page.goto(`/member?id=${main.id}`);
    await expect(page.locator(".calendar")).toBeVisible();
  });
});

test("관리자 화면 스크린샷", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await seed();

  await capture(page, testInfo, "admin-login", async () => {
    await page.goto("/admin");
  });
  await adminLogin(page);
  for (const [name, url] of [
    ["admin-dashboard", "/admin"],
    ["admin-members", "/admin/members"],
    ["admin-entitlements", "/admin/entitlements"],
    ["admin-plans", "/admin/plans"],
    ["admin-attendance", "/admin/attendance"],
    ["admin-groups", "/admin/groups"],
  ] as const) {
    await capture(page, testInfo, name, async () => {
      await page.goto(url);
    });
  }
});

test("터치 영역: 체크인 입력 56px+, 버튼 52px+", async ({ page }, testInfo) => {
  // 데스크톱(768px+)에서는 design.md대로 버튼이 44px로 줄어든다. 터치 기준은 모바일에만 건다.
  test.skip(!testInfo.project.name.startsWith("mobile"), "모바일 전용 기준");
  const plan = await createPlan();
  const member = await createMember({ name: "가상회원 하나", last4: "2468" });
  await grantEntitlement({ memberId: member.id, planId: plan.id });

  await page.goto("/check-in");
  expect((await codeInput(page).boundingBox())!.height).toBeGreaterThanOrEqual(56);
  await codeInput(page).fill("2468");
  const pick = page.getByRole("button", { name: /가상회원 하나/ });
  expect((await pick.boundingBox())!.height).toBeGreaterThanOrEqual(52);
  await pick.click();
  const next = page.getByRole("button", { name: "다음 사람 체크인" });
  expect((await next.boundingBox())!.height).toBeGreaterThanOrEqual(52);

  await page.goto("/member");
  expect((await codeInput(page).boundingBox())!.height).toBeGreaterThanOrEqual(56);
});
