// public/icons/icon.svg → PWA·홈 화면용 PNG들. 아이콘을 바꿀 때만 다시 돌린다.
//   node scripts/generate-icons.mjs
// Playwright에 딸린 Chromium으로 그린다(추가 의존성 없음).

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "public", "icons");
const svg = readFileSync(path.join(OUT, "icon.svg"), "utf8");

// maskable은 안드로이드가 원·물방울 등으로 잘라내므로 안전 영역(가운데 80%) 안에 그림을 둔다.
const TARGETS = [
  { file: "icon-192.png", size: 192, scale: 1 },
  { file: "icon-512.png", size: 512, scale: 1 },
  { file: "icon-maskable-512.png", size: 512, scale: 0.72 },
  { file: "apple-touch-icon.png", size: 180, scale: 0.86 },
];

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });

for (const { file, size, scale } of TARGETS) {
  const inner = Math.round(size * scale);
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<!doctype html><html><body style="margin:0;background:#8B5A3C;
    display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px">
    <div style="width:${inner}px;height:${inner}px">${svg.replace("<svg ", `<svg width="${inner}" height="${inner}" `)}</div>
    </body></html>`);
  await page.screenshot({ path: path.join(OUT, file), clip: { x: 0, y: 0, width: size, height: size } });
  console.log(`생성: public/icons/${file}`);
}

await browser.close();
