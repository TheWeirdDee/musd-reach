// Production acceptance: never connects a real wallet and never signs or sends a transaction.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
const BASE = process.argv[2] ?? "http://localhost:3002";
const OUT = "../../evidence/product-review";
mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); };
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });
await context.addInitScript(() => { window.__walletRequests = []; window.ethereum = { request: async ({ method }) => { window.__walletRequests.push(method); throw new Error("No wallet requests permitted in production safety hold test"); }, on() {}, removeListener() {} }; });
const page = await context.newPage();
page.setDefaultNavigationTimeout(90_000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  const routes = ["/", "/app", "/app/wrap", "/app/portable/new", "/app/redeem", "/app/history", "/proof", "/contracts", "/developers", "/integrations", "/status", "/risks", "/security", "/docs", "/docs/getting-started", "/docs/recovery", "/docs/sdk"];
  for (const path of routes) {
    const response = await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(350);
    const data = await page.evaluate(() => ({ title: document.title, description: document.querySelector('meta[name="description"]')?.content, canonical: document.querySelector('link[rel="canonical"]')?.href, og: document.querySelector('meta[property="og:image"]')?.content, robots: document.querySelector('meta[name="robots"]')?.content, h1: document.querySelectorAll("h1").length, marketingFooter: !!document.querySelector("[data-marketing-footer]"), requests: window.__walletRequests, connects: [...document.querySelectorAll("button")].filter((b) => /connect wallet/i.test(b.textContent)).length }));
    check(`${path}: real page with one main heading`, response.status() === 200 && data.h1 === 1);
    check(`${path}: title, description, canonical and social image`, !!data.title && !!data.description && data.canonical === `https://musd-reach.vercel.app${path === "/" ? "/" : path}` && !!data.og);
    check(`${path}: footer matches its shell`, data.marketingFooter === (path === "/"));
    check(`${path}: safety hold makes no wallet requests or connection invitation`, data.requests.length === 0 && data.connects === 0);
    if (path.startsWith("/app")) check(`${path}: private state excluded from indexing`, /noindex/.test(data.robots ?? ""));
  }
  await page.goto(`${BASE}/docs/getting-started`);
  await page.getByRole("searchbox").fill("settlement");
  check("Docs filtering finds the recovery guide", await page.getByRole("navigation", { name: "Documentation", exact: true }).getByRole("link", { name: "Pending settlement and recovery" }).count() === 1);
  await page.getByRole("searchbox").fill("");
  await page.getByRole("navigation", { name: "Adjacent guides" }).getByRole("link").last().click();
  await page.waitForURL("**/docs/how-it-works");
  check("Docs next navigation has a stable article URL", page.url().endsWith("/docs/how-it-works"));
  await page.goto(`${BASE}/docs/sdk`);
  await page.getByRole("button", { name: "Copy Typechecked read-only SDK example", exact: true }).click();
  await page.getByRole("button", { name: "Copy Typechecked read-only SDK example", exact: true }).getByText("Copied", { exact: true }).waitFor();
  const expected = JSON.parse(readFileSync("src/generated/developer-example.json", "utf8")).code;
  check("Docs copy uses the typechecked example verbatim", (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, "\n") === expected.replace(/\r\n/g, "\n"));
  const sitemap = await (await context.request.get(`${BASE}/sitemap.xml`)).text();
  check("Sitemap includes docs and excludes wallet-state pages", sitemap.includes("/docs/recovery") && !sitemap.includes("/app/wrap"));
  const robots = await (await context.request.get(`${BASE}/robots.txt`)).text();
  check("Robots excludes private app routes", robots.includes("Disallow: /app"));
  const manifest = await (await context.request.get(`${BASE}/manifest.webmanifest`)).json();
  check("Manifest uses Reach branding and PNG icons", manifest.name === "MUSD Reach" && manifest.icons.length >= 2);
  for (const path of ["/favicon.ico", "/icon.svg", "/apple-icon.png", "/icons/reach-192.png", "/icons/reach-512.png", "/opengraph-image"]) {
    const res = await context.request.get(`${BASE}${path}`);
    check(`${path}: served branded asset`, res.ok() && (await res.body()).length > 100);
  }
  const version = await (await context.request.get(`${BASE}/api/version`)).json();
  check("Version response reports unresolved safety status honestly", version.walletSafety === "under-investigation" && (version.revision === null || /^[0-9a-f]{40}$/.test(version.revision)));
  for (const path of ["/docs/not-a-guide", "/proof/not-a-run"]) {
    const res = await context.request.get(BASE + path);
    check(`${path}: actual 404`, res.status() === 404);
  }
  // Independent chain failures must remain UNKNOWN. No invented healthy/zero state.
  await context.route(/https:\/\/(rpc\.test\.mezo\.org|base-sepolia-rpc\.publicnode\.com|sepolia\.base\.org)\/?/, async (route) => {
    const req = route.request().postDataJSON();
    const fail = (r) => ({ jsonrpc: "2.0", id: r.id, error: { code: -32000, message: "RPC unavailable — test fixture" } });
    await route.fulfill({ json: Array.isArray(req) ? req.map(fail) : fail(req), headers: { "access-control-allow-origin": "*" } });
  });
  await context.route("https://musd-reach-api.onrender.com/**", (route) => route.fulfill({ status: 502, json: { error: "TEST_API_UNAVAILABLE" }, headers: { "access-control-allow-origin": "*" } }));
  await page.goto(`${BASE}/status`);
  await page.getByText("UNKNOWN · read failed").nth(1).waitFor({ timeout: 45_000 });
  check("RPC failure shows unknown for each chain independently", await page.getByText("UNKNOWN · read failed").count() === 2);
  check("Service failure does not claim protocol custody failed", await page.getByText("UNKNOWN · unavailable", { exact: true }).count() === 1);
  check("No uncaught page errors", errors.length === 0, errors.join(" | "));
} catch (e) { check("Acceptance suite completed", false, e.stack); }
finally { writeFileSync(`${OUT}/acceptance.json`, JSON.stringify({ checkedAt: new Date().toISOString(), base: BASE, results }, null, 2)); await browser.close(); }
const passed = results.filter((r) => r.ok).length;
console.log(`${passed}/${results.length} passed`);
assert.equal(passed, results.length);
