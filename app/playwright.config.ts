import { defineConfig, devices } from "@playwright/test";
import { APP_ENV, APP_PORT, APP_URL, SUPABASE_URL } from "./test-db/config.mjs";

// E2E: 실제 Supabase 대신 로컬 테스트 DB 스택(test-db/start.mjs)에 앱을 붙여 돌린다.
//
//   npm run test:e2e                         → 세 브라우저 전부
//   npx playwright test --project=mobile-chromium
//
// 테스트는 한 DB를 같이 쓰므로 순서대로(workers 1) 돈다.

const CI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: CI,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: APP_URL,
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    // DB 함수만 보는 테스트 — 브라우저 하나에서 한 번만 돌린다.
    { name: "db", testMatch: /db\/.*\.spec\.ts/ },
    {
      name: "mobile-webkit",
      testIgnore: /db\//,
      use: { ...devices["iPhone 13"] },
    },
    {
      name: "mobile-chromium",
      testIgnore: /db\//,
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "desktop-chromium",
      testIgnore: /db\//,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: [
    {
      command: "node test-db/start.mjs",
      url: `${SUPABASE_URL}/__health`,
      reuseExistingServer: !CI,
      timeout: 120_000,
      stdout: "pipe",
    },
    {
      command: `npm run build && npx next start -H 127.0.0.1 -p ${APP_PORT}`,
      url: APP_URL,
      reuseExistingServer: !CI,
      timeout: 300_000,
      env: APP_ENV,
      stdout: "pipe",
    },
  ],
});
