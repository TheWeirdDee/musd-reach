// The optional history API sleeps on free hosting and takes about a minute to answer its first
// request. Every API response is delayed in the browser to simulate that wake-up. Pages must say
// the service is waking, must not show a false "no transfers" / "not indexed" state while
// waiting, and must show the real data once it arrives.
//
//   node e2e/api-waking.mjs [baseUrl] [apiUrl]   (production build with NEXT_PUBLIC_API_URL=apiUrl)
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:3000";
const API = process.argv[3] ?? "https://musd-reach-api.onrender.com";
const DELAY_MS = 12_000;
const ACCOUNT = "0x0F579957D94D1D12Fbb0dE3A495180629098Efe6"; // has indexed transfers on the v2 deployment
const TRANSFER = "0x9fbde66ef230e7f12a6a4a3f86accf95ec3aca19e974b68f0ac9ae11246fc404";

const results = [];
const check = (n, ok, d = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"} ${n}${d ? ` — ${d}` : ""}`);
};

// Keyless wallet: reads only, rejects any signing request.
const wallet = (account) => {
  window.ethereum = {
    request: async ({ method }) => {
      if (method === "eth_requestAccounts" || method === "eth_accounts") return [account];
      if (method === "eth_chainId") return "0x7b7b";
      if (method === "wallet_getPermissions" || method === "wallet_requestPermissions") return [{ parentCapability: "eth_accounts" }];
      throw Object.assign(new Error("rejected"), { code: 4001 });
    },
    on() {},
    removeListener() {},
  };
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
// Delay, then serve the real API response. CORS is re-granted for this origin, because the hosted
// API only allows the production site; for the hosted site itself this changes nothing.
await ctx.route(`${API}/**`, async (route) => {
  await new Promise((r) => setTimeout(r, DELAY_MS));
  const res = await route.fetch({ headers: { ...route.request().headers(), origin: undefined } });
  await route.fulfill({ response: res, headers: { ...res.headers(), "access-control-allow-origin": new URL(BASE).origin } });
});
await ctx.addInitScript(wallet, ACCOUNT);
const errors = [];

// History
try {
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE + "/app/history", { waitUntil: "domcontentloaded" });
  await page.locator("header").getByRole("button", { name: "Connect wallet" }).click();
  await page.getByRole("button", { name: /Browser wallet/ }).click();
  await page.getByText("Waking the history service").waitFor({ timeout: 15_000 });
  check("history: waking notice appears while the API is slow", true);
  check("history: no false 'No transfers' while waiting", (await page.getByText("No transfers for this address").count()) === 0);
  await page.getByText(/Mezo → Base|Base → Mezo/).first().waitFor({ timeout: 60_000 });
  check("history: indexed transfers appear once the API answers", true);
  check("history: waking notice is gone after the answer", (await page.getByText("Waking the history service").count()) === 0);
  await page.close();
} catch (e) {
  check("section completed", false, e.message.split("\n")[0]);
}

// Tracker without a local record or ?tx: it depends on the API to find the origin transaction.
try {
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${BASE}/app/transfers/${TRANSFER}`, { waitUntil: "domcontentloaded" });
  await page.getByText("Waking the history service").waitFor({ timeout: 15_000 });
  check("tracker: waking notice instead of 'has not indexed it' while waiting", (await page.getByText("has not indexed it").count()) === 0);
  await page.getByText("Origin transaction unknown").waitFor({ timeout: 1_000 }).then(
    () => check("tracker: no 'Origin transaction unknown' while waiting", false),
    () => check("tracker: no 'Origin transaction unknown' while waiting", true),
  );
  await page.close();
} catch (e) {
  check("section completed", false, e.message.split("\n")[0]);
}

// Status
try {
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE + "/status", { waitUntil: "domcontentloaded" });
  await page.getByText("Waking the history service").waitFor({ timeout: 15_000 });
  check("status: waking notice while the API is slow, not 'unreachable'", (await page.getByText(/unreachable|did not respond/).count()) === 0);
  await page.close();
} catch (e) {
  check("section completed", false, e.message.split("\n")[0]);
}

check("no uncaught page errors", errors.length === 0, errors.join(" | "));
await browser.close();
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
