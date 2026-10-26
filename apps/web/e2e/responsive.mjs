// Every route at phone, tablet and desktop widths: the page must not scroll sideways, must render
// a heading, and must throw no page errors. Horizontal scroll is measured by actually scrolling
// (the body clips decorative overflow, so scrollWidth alone over-reports); tables and code blocks
// may scroll inside their own containers.
//
//   node e2e/responsive.mjs [baseUrl]
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:3000";
const ROUTES = [
  "/docs", "/docs/getting-started", "/docs/sdk", "/docs/recovery", "/contracts", "/security",
  "/",
  "/app",
  "/app/wrap",
  "/app/portable/new",
  "/app/redeem",
  "/app/history",
  "/app/transfers/0x9fbde66ef230e7f12a6a4a3f86accf95ec3aca19e974b68f0ac9ae11246fc404",
  "/proof",
  "/proof/testnet-2026-10-21T11-23-33-084Z",
  "/proof/testnet-2026-10-20T15-05-14-568Z",
  "/status",
  "/integrations",
  "/developers",
  "/risks",
  "/no-such-page",
];
const WIDTHS = [320, 360, 375, 390, 430, 768, 1024, 1280, 1440, 1920];
// Both motion settings: with reduced motion no animation transform wraps content, which once let an
// absolutely positioned sr-only header escape its scroll region and widen the page (F-29).
const MOTION = ["reduce", "no-preference"];

const browser = await chromium.launch();
let failed = 0;
for (const motion of MOTION) for (const w of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: w === 768 ? 390 : w === 430 ? 932 : w === 320 ? 568 : 800 }, reducedMotion: motion });
  for (const r of ROUTES) {
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(BASE + r, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForTimeout(500);
    const o = await page.evaluate(() => {
      window.scrollTo(10_000, 0);
      return { scrollX: window.scrollX, h1: document.querySelector("h1")?.textContent?.trim() ?? "" };
    });
    const ok = o.scrollX === 0 && o.h1.length > 0 && errors.length === 0;
    if (!ok) {
      failed++;
      console.log(`FAIL ${w}px ${motion} ${r} — scrollX ${o.scrollX}, h1 "${o.h1.slice(0, 30)}" ${errors.join(" | ")}`);
    }
    await page.close();
  }
  await ctx.close();
}
await browser.close();
const total = ROUTES.length * WIDTHS.length * MOTION.length;
console.log(`\n${total - failed}/${total} route × width × motion combinations: no sideways scroll, heading present, no page errors`);
process.exit(failed ? 1 : 0);
