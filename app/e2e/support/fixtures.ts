import { test as base, expect, type Page } from "@playwright/test";
import { ADMIN_PASSWORD, APP_URL } from "../../test-db/config.mjs";
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

const ADMIN_COOKIE = "jb_admin";

export async function adminLogin(page: Page) {
  await page.goto("/admin");
  await page.getByLabel("비밀번호").fill(ADMIN_PASSWORD);
  const loginResponse = page.waitForResponse(
    async (res) =>
      res.request().method() === "POST" &&
      ((await res.headerValue("set-cookie")) ?? "").includes(`${ADMIN_COOKIE}=`),
  );
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page.getByRole("heading", { name: "회원 관리 및 수강권 운영" })).toBeVisible();

  // 앱은 운영 빌드(next start)에서 세션 쿠키에 Secure를 붙인다. Chromium은 http://127.0.0.1을
  // 안전한 출처로 보고 저장하지만 WebKit은 저장하지 않아 다음 페이지 이동에서 로그인이 풀린다.
  // 실제 배포는 HTTPS라 문제없으므로 앱은 그대로 두고, 테스트에서만 같은 값을 Secure 없이 넣어 준다.
  const setCookie = (await (await loginResponse).headerValue("set-cookie")) ?? "";
  const token = new RegExp(`${ADMIN_COOKIE}=([^;]+)`).exec(setCookie)?.[1];
  if (!token) throw new Error("로그인 응답에서 세션 쿠키를 찾지 못했다");
  await page.context().addCookies([{ name: ADMIN_COOKIE, value: token, url: APP_URL }]);
}

/** 관리자 화면이 로그인 화면으로 튕기지 않았는지 */
export async function expectAdminSignedIn(page: Page) {
  await expect(page.getByRole("heading", { name: "회원 관리 및 수강권 운영" })).toBeVisible();
}
