import { codeInput, expect, test } from "./support/fixtures";
import {
  createGroup,
  createMember,
  createPlan,
  db,
  grantEntitlement,
} from "./support/db";
import { formatDate } from "../lib/format";

// 허브(/)와 회원 조회(/member) 현재 동작 고정.

test("허브: 카드 3개가 순서대로 있고 각 화면으로 간다", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("쥬발레아카데미 회원 시스템");
  const cards = page.locator("a.card-link");
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(0)).toHaveAttribute("href", "/check-in");
  await expect(cards.nth(1)).toHaveAttribute("href", "/member");
  await expect(cards.nth(2)).toHaveAttribute("href", "/admin");

  await cards.nth(0).click();
  await expect(page).toHaveURL(/\/check-in$/);
  await expect(codeInput(page)).toBeVisible();
});

test("회원 조회: 4자리 → 본인 선택 → 이용 현황", async ({ page }) => {
  const group = await createGroup("예시 오전반");
  const plan = await createPlan({ name: "예시 요금제 주2회", monthly_limit: 8 });
  const member = await createMember({ name: "가상회원 하나", last4: "7777", groupId: group.id });
  const ent = await grantEntitlement({ memberId: member.id, planId: plan.id, remaining: 6, endOffset: 20 });
  await db.rpc("check_in_member", { p_member_id: member.id });

  await page.goto("/member");
  await expect(page.getByRole("heading", { name: "회원 정보 확인" })).toBeVisible();
  await codeInput(page).fill("7777");
  await page.getByRole("link", { name: /가상회원 하나/ }).click();

  await expect(page).toHaveURL(new RegExp(`/member\\?id=${member.id}`));
  await expect(page.getByRole("heading", { name: "가상회원 하나님의 이용 현황" })).toBeVisible();
  await expect(page.getByText("총 8회 중")).toBeVisible();
  await expect(page.locator(".stat-value").first()).toHaveText("5");
  await expect(page.getByText("D-20")).toBeVisible();
  await expect(page.getByText(`${formatDate(ent.end_date)}까지`)).toBeVisible();
  await expect(page.getByText("예시 요금제 주2회")).toBeVisible();
  await expect(page.getByText("예시 오전반")).toBeVisible();
  await expect(page.locator(".calendar-present")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "최근 출석 기록" })).toBeVisible();
  // 다음 달(미래)로는 이동하지 못한다.
  await expect(page.getByText("다음 달 →")).toHaveAttribute("aria-disabled", "true");
});

test("회원 조회: 수강권·출석이 없으면 빈 상태 문구", async ({ page }) => {
  const member = await createMember({ name: "가상회원 신규", last4: "8888" });
  await page.goto(`/member?id=${member.id}`);
  await expect(page.getByText("현재 이용 가능한 수강권이 없습니다.")).toBeVisible();
  await expect(page.getByText("아직 출석 기록이 없습니다.")).toBeVisible();
  await expect(page.getByText("이용 가능한 수강권 없음")).toBeVisible();
});

test("회원 조회: 미등록 번호", async ({ page }) => {
  await page.goto("/member");
  await codeInput(page).fill("0000");
  await expect(page.getByRole("status").filter({ hasText: "일치하는 회원이 없습니다. 데스크에 문의해 주세요." })).toBeVisible();
});

test("회원 조회: 없는 id는 404", async ({ page }) => {
  const res = await page.goto("/member?id=00000000-0000-0000-0000-000000000000");
  expect(res?.status()).toBe(404);
});
