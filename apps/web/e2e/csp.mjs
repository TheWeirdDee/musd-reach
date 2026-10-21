// Content-Security-Policy against a production build (`next build && next start`). For every
// route: the header is present and strict, every rendered <script> carries this response's
// nonce, nonces differ per request, the page renders and hydrates with zero CSP violations,
// and an injected inline script or eval is refused.
//
//   node e2e/csp.mjs [baseUrl]
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:3000";
const ROUTES = [
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

const results = [];
const check = (n, ok, d = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"} ${n}${d ? ` — ${d}` : ""}`);
};
const directive = (csp, name) => csp.split(";").map((s) => s.trim()).find((s) => s.startsWith(name + " "));

// Policy shape, from one response.
const first = await fetch(BASE + "/");
const csp = first.headers.get("content-security-policy") ?? "";
check("CSP header present", csp.length > 0);
const script = directive(csp, "script-src") ?? "";
check("script-src uses a nonce and strict-dynamic", /'nonce-[A-Za-z0-9+/=]+'/.test(script) && script.includes("'strict-dynamic'"), script.replace(/'nonce-[^']+'/, "'nonce-…'"));
check("script-src has no unsafe-inline / unsafe-eval", !/unsafe-inline|unsafe-eval/.test(script));
check("style-src has no unsafe-inline", !(directive(csp, "style-src") ?? "").includes("unsafe-inline") && !csp.includes("style-src-attr"));
check("object-src 'none', frame-ancestors 'none', base-uri 'self'", ["object-src 'none'", "frame-ancestors 'none'", "base-uri 'self'"].every((d) => csp.includes(d)));
const connect = directive(csp, "connect-src") ?? "";
check("connect-src is an explicit list (no wildcard, no bare scheme)", !/(\s|^)\*|\shttps:(\s|$)|\swss?:(\s|$)/.test(connect), connect);
const second = await fetch(BASE + "/");
const nonceOf = (h) => /'nonce-([^']+)'/.exec(h ?? "")?.[1];
check("nonce differs per request", nonceOf(csp) && nonceOf(csp) !== nonceOf(second.headers.get("content-security-policy")));

const browser = await chromium.launch();
const ctx = await browser.newContext();
await ctx.addInitScript(() => {
  window.__cspViolations = [];
  document.addEventListener("securitypolicyviolation", (e) =>
    window.__cspViolations.push(`${e.violatedDirective} ${e.blockedURI || "inline"} ${e.sourceFile ?? ""}:${e.lineNumber ?? ""}`),
  );
});

for (const r of ROUTES) {
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const res = await page.goto(BASE + r, { waitUntil: "networkidle", timeout: 120_000 });
  const header = res.headers()["content-security-policy"] ?? "";
  const nonce = nonceOf(header);
  const scripts = await page.$$eval("script", (s) => s.map((x) => ({ src: x.src, nonce: x.nonce })));
  const unnonced = scripts.filter((s) => s.nonce !== nonce);
  // Hydration: the wallet button is a client component; it renders only after React hydrates.
  const hydrated = await page.locator("header button").first().isVisible().catch(() => false);
  const violations = await page.evaluate(() => window.__cspViolations);
  check(
    `${r}: ${res.status()}, ${scripts.length} scripts nonce'd, hydrated, 0 violations`,
    !!nonce && unnonced.length === 0 && hydrated && violations.length === 0 && errors.length === 0,
    [unnonced.length && `${unnonced.length} without nonce`, !hydrated && "not hydrated", ...violations, ...errors].filter(Boolean).join("; "),
  );
  await page.close();
}

// Enforcement, as an HTML-injection bug would see it: the served document is altered in flight to
// contain an inline script without the nonce, an inline event handler, and a nonce-carrying
// script (standing in for trusted code) that tries eval. DevTools evaluation is exempt from CSP,
// so these must run from the document itself.
const page = await ctx.newPage();
await page.route(BASE + "/", async (route) => {
  const res = await route.fetch();
  const nonce = nonceOf(res.headers()["content-security-policy"]);
  const html = (await res.text()).replace(
    "</body>",
    `<script>window.__inline = true</script>` +
      `<img src="/missing.png" onerror="window.__handler = true">` +
      `<script nonce="${nonce}">try { window.__eval = eval("true") } catch (e) { window.__eval = "refused: " + e.name }</script></body>`,
  );
  await route.fulfill({ response: res, body: html });
});
await page.goto(BASE + "/", { waitUntil: "networkidle" });
const outcome = await page.evaluate(() => ({ inline: window.__inline ?? false, handler: window.__handler ?? false, evalResult: window.__eval, violations: window.__cspViolations }));
check("injected inline script is refused", outcome.inline === false && outcome.violations.some((v) => v.startsWith("script-src")));
check("injected inline event handler is refused", outcome.handler === false);
check("eval from page script is refused", typeof outcome.evalResult === "string" && outcome.evalResult.startsWith("refused"), String(outcome.evalResult));

await browser.close();
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
