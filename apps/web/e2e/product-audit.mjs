// Read-only route inventory, visual captures, metadata and network audit. Never signs or sends.
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
const BASE = process.argv[2] ?? "http://localhost:3002";
const OUT = process.argv[3] ?? "../../evidence/product-review/after";
const widths = process.env.AUDIT_WIDTHS?.split(",").map(Number) ?? [1280, 390];
const routes = ["/", "/app", "/app/wrap", "/app/portable/new", "/app/redeem", "/app/history", "/app/transfers/0x9fbde66ef230e7f12a6a4a3f86accf95ec3aca19e974b68f0ac9ae11246fc404", "/proof", "/proof/testnet-2026-10-21T11-23-33-084Z", "/integrations", "/developers", "/status", "/contracts", "/risks", "/docs", "/docs/getting-started", "/docs/recovery", "/security"];
if (process.env.AUDIT_ALL_DOCS) {
  const xml = await (await fetch(BASE + "/sitemap.xml")).text();
  for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) { const path = new URL(match[1]).pathname; if (path.startsWith("/docs/") && !routes.includes(path)) routes.push(path); }
}
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const results = [], assets = new Map(), network = new Set();
try {
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 900 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(90_000);
    let errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("request", (req) => { network.add(new URL(req.url()).origin); });
    page.on("response", async (res) => {
      if (res.request().resourceType() !== "script" || assets.has(res.url())) return;
      assets.set(res.url(), { pending: true });
      try { const body = await res.body(); assets.set(res.url(), { bytes: body.length, sha256: createHash("sha256").update(body).digest("hex") }); } catch { assets.set(res.url(), { unavailable: true }); }
    });
    for (const path of routes) {
      errors = [];
      try {
        const response = await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(900);
        // Full-page captures paint sticky headers at the current scroll position.
        // Reset after navigation/hydration so the image starts at the real page top.
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(100);
        const details = await page.evaluate(() => ({
          title: document.title, description: document.querySelector('meta[name="description"]')?.content,
          canonical: document.querySelector('link[rel="canonical"]')?.href,
          icon: document.querySelector('link[rel="icon"]')?.href,
          h1: [...document.querySelectorAll("h1")].map((e) => e.textContent),
          headings: [...document.querySelectorAll("h2")].map((e) => e.textContent),
          marketingFooter: !!document.querySelector('[data-marketing-footer]') || !!document.querySelector('footer a[href="/app/portable/new"]'),
          overflow: document.documentElement.scrollWidth - innerWidth,
          buttons: [...document.querySelectorAll("button")].map((e) => ({ text: e.textContent, disabled: e.disabled })),
          scripts: [...document.scripts].map((e) => ({ src: e.src, nonce: !!e.nonce })),
        }));
        const slug = path === "/" ? "landing" : path.replaceAll("/", "-").slice(1, 85);
        await page.screenshot({ path: `${OUT}/${slug}-${width}.png`, fullPage: true, animations: "disabled" });
        results.push({ path, width, status: response?.status(), csp: response?.headers()["content-security-policy"], ...details, errors: [...errors] });
        console.log(`${response?.status()} ${width} ${path} overflow=${details.overflow}`);
      } catch (e) { results.push({ path, width, error: e.message }); console.log(`ERROR ${width} ${path}: ${e.message.split("\n")[0]}`); }
      writeFileSync(`${OUT}/audit.json`, JSON.stringify({ checkedAt: new Date().toISOString(), base: BASE, results, network: [...network], assets: Object.fromEntries(assets) }, null, 2));
    }
    await context.close();
  }
} finally { await browser.close(); }
