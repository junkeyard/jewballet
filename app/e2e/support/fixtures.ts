import { test as base, expect, type Page } from "@playwright/test";
import { ADMIN_PASSWORD } from "../../test-db/config.mjs";
import { resetDb, setNetworkFault } from "./db";

// 모든 E2E 테스트의 공통 바탕.
//  · 테스트마다 DB를 비우고 시작한다(데이터는 각 테스트가 필요한 만큼 만든다).
//  · 앱의 rate limit은 x-forwarded-for 기준이라, 테스트마다 다른 가짜 IP를 붙여 서로 간섭하지 않게 한다.

let ipSeq = 0;

export const test = base.extend<{ cleanDb: void }>({
  cleanDb: [
    async ({}, use) => {
      await setNetworkFault(false);
      await resetDb();
      await use();
      await setNetworkFault(false);
    },
    { auto: true },
  ],
  context: async ({ context }, use, testInfo) => {
    ipSeq += 1;
    await context.setExtraHTTPHeaders({
      "x-forwarded-for": `10.${testInfo.workerIndex % 250}.${Math.floor(ipSeq / 250) % 250}.${(ipSeq % 250) + 1}`,
    });
    await use(context);
  },
});

export { expect };

/** 체크인·회원조회 화면의 4자리 입력칸 */
export function codeInput(page: Page) {
  return page.getByRole("textbox", { name: "전화번호 뒤 4자리" });
}

export async function adminLogin(page: Page) {
  await page.goto("/admin");
  await page.getByLabel("비밀번호").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page.getByRole("heading", { name: "회원 관리 및 수강권 운영" })).toBeVisible();
}
