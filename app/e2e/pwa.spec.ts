import { expect, test } from "./support/fixtures";

// PWA 기본: manifest·아이콘·홈 화면 추가용 메타. 서비스 워커는 두지 않는다(오프라인 캐시가
// 체크인 결과를 낡게 보여줄 위험이 있어 의도적으로 제외).

test("manifest와 아이콘이 제공된다", async ({ page, request }) => {
  await page.goto("/");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(href).toBeTruthy();

  const res = await request.get(href!);
  expect(res.ok()).toBe(true);
  const manifest = await res.json();
  expect(manifest).toMatchObject({
    name: "쥬발레아카데미 회원 시스템",
    short_name: "쥬발레",
    start_url: "/",
    display: "standalone",
    lang: "ko",
  });

  const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes);
  expect(sizes).toEqual(expect.arrayContaining(["192x192", "512x512"]));
  expect(manifest.icons.some((icon: { purpose?: string }) => icon.purpose === "maskable")).toBe(true);

  for (const icon of manifest.icons as { src: string; type: string }[]) {
    const iconRes = await request.get(icon.src);
    expect(iconRes.ok(), icon.src).toBe(true);
    expect(iconRes.headers()["content-type"]).toContain(icon.type);
  }
});

test("iOS 홈 화면 추가용 메타", async ({ page, request }) => {
  await page.goto("/");
  const touchIcon = page.locator('link[rel="apple-touch-icon"]');
  await expect(touchIcon).toHaveCount(1);
  expect((await request.get((await touchIcon.getAttribute("href"))!)).ok()).toBe(true);
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute("content", "쥬발레");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#faf6f0");
});
