import { adminLogin, expect, test } from "./support/fixtures";
import {
  countAttendance,
  createGroup,
  createMember,
  createPlan,
  db,
  getEntitlement,
  grantEntitlement,
} from "./support/db";

// /admin 현재 동작 고정. 쓰기 동작은 대표 흐름만(등록·부여·수동 출석·취소).

test("로그인: 틀린 비밀번호는 막고, 맞으면 대시보드", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "관리자 로그인" })).toBeVisible();
  await page.getByLabel("비밀번호").fill("9999");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page.getByRole("status").filter({ hasText: "비밀번호가 맞지 않습니다." })).toBeVisible();

  await adminLogin(page);
  await expect(page.getByText("오늘 출석한 회원이 아직 없습니다.")).toBeVisible();

  await page.getByRole("button", { name: "로그아웃" }).click();
  await expect(page.getByRole("heading", { name: "관리자 로그인" })).toBeVisible();
});

test("탭 6개가 모두 열린다", async ({ page }) => {
  await adminLogin(page);
  const tabs: [string, string][] = [
    ["회원", "회원 등록"],
    ["수강권", "수강권 목록"],
    ["상품", "상품 목록"],
    ["출석부", "수동 출석 등록"],
    ["반 관리", "반 목록"],
    ["대시보드", "오늘 출석"],
  ];
  for (const [tab, heading] of tabs) {
    await page.locator("nav.tabs").getByRole("link", { name: tab, exact: true }).click();
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    await expect(page.locator("nav.tabs .tab-active")).toHaveText(tab);
  }
});

test("대시보드: 오늘 QR 출석이 표에 나온다", async ({ page }) => {
  const plan = await createPlan();
  const member = await createMember({ name: "가상회원 하나", last4: "1212" });
  await grantEntitlement({ memberId: member.id, planId: plan.id });
  await db.rpc("check_in_member", { p_member_id: member.id });

  await adminLogin(page);
  const row = page.locator("table").first().getByRole("row", { name: /가상회원 하나/ });
  await expect(row).toContainText("QR");
});

test("회원 등록 → 수강권 부여 → 수동 출석 → 같은 날 중복 차단 → 출석 취소로 횟수 복구", async ({ page }) => {
  await createGroup("예시 오전반");
  await createPlan({ name: "예시 요금제 주2회", monthly_limit: 8, duration_days: 30 });
  await adminLogin(page);

  // 회원 등록
  await page.goto("/admin/members");
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "회원 등록" }) });
  await form.getByLabel("이름").fill("가상회원 등록");
  await form.getByLabel("연락처").fill("010-0000-4321");
  await form.getByLabel("소속반").selectOption({ label: "예시 오전반" });
  await form.getByRole("button", { name: "회원 등록" }).click();
  await expect(page.getByText("가상회원 등록 회원을 등록했습니다.")).toBeVisible();

  const { data: member } = await db.from("members").select("id, phone_last4").eq("name", "가상회원 등록").single();
  expect(member?.phone_last4).toBe("4321");

  // 같은 번호 재등록은 막힌다
  await form.getByLabel("이름").fill("가상회원 중복");
  await form.getByLabel("연락처").fill("01000004321");
  await form.getByRole("button", { name: "회원 등록" }).click();
  await expect(page.getByText("이미 등록된 연락처입니다.")).toBeVisible();

  // 수강권 부여
  await page.goto("/admin/entitlements");
  await page.getByLabel("회원").selectOption({ label: "가상회원 등록 (4321)" });
  await page.getByLabel("수강권 상품").selectOption({ index: 1 });
  await page.getByRole("button", { name: "수강권 부여" }).click();
  await expect(page.getByText("예시 요금제 주2회 수강권을 부여했습니다.")).toBeVisible();
  const { data: ent } = await db.from("entitlements").select("id, remaining_count").eq("member_id", member!.id).single();
  expect(ent?.remaining_count).toBe(8);

  // 수동 출석
  await page.goto("/admin/attendance");
  const addForm = page.locator("form").filter({ has: page.getByRole("button", { name: "출석 등록" }) });
  await addForm.getByLabel("회원").selectOption({ label: "가상회원 등록" });
  await addForm.getByRole("button", { name: "출석 등록" }).click();
  await expect(page.getByText("출석을 등록했습니다.")).toBeVisible();
  expect((await getEntitlement(ent!.id)).remaining_count).toBe(7);

  await addForm.getByLabel("회원").selectOption({ label: "가상회원 등록" });
  await addForm.getByRole("button", { name: "출석 등록" }).click();
  await expect(page.getByText("해당 날짜에 이미 출석 기록이 있습니다.")).toBeVisible();
  expect((await getEntitlement(ent!.id)).remaining_count).toBe(7);

  // 출석 취소 (확인 창 수락)
  await page.reload();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "출석 취소" }).first().click();
  // 현재 동작: 취소가 끝나면 그 행이 목록에서 사라지면서 행 안의 완료 문구도 같이 사라진다.
  await expect(page.getByRole("button", { name: "출석 취소" })).toHaveCount(0);
  await expect.poll(async () => (await getEntitlement(ent!.id)).remaining_count).toBe(8);
  expect(await countAttendance(member!.id)).toBe(0);
});
