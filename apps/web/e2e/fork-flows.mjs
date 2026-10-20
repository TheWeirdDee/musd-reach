// Browser E2E of the signing flows against LOCAL ANVIL FORKS with the wagmi mock connector.
// Prerequisites (see docs/TESTING.md): forks on :8545/:8546 with --auto-impersonate, a v2 fork
// deployment, a funded E2E account, and `next dev` started with NEXT_PUBLIC_E2E_ACCOUNT set.
//
//   node e2e/fork-flows.mjs <phase> [outDir]
//     phase "wrap"    : connect, wrap 2 MUSD and make portable -> tracker shows "Locked · not minted yet"
//     phase "minted"  : after delivering the ISSUE on the fork, tracker shows "Backed on Base"
//     phase "redeem"  : burn 1 rwSMUSD in MUSD mode -> tracker shows "Burned · awaiting release"
//     phase "released": after delivering the REDEEM, tracker shows "Released on Mezo"
//   Prints `ORIGIN_TX=<hash>` for the transaction the phase created.
import { chromium } from "playwright";

const BASE = process.env.E2E_URL ?? "http://localhost:3001";
const [phase, outDir = "."] = process.argv.slice(2);
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

async function connect(path = "/app") {
  if (path) await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  const header = page.locator("header");
  const already = await header.getByRole("button", { name: /^0x0000…2e01$/i }).count();
  if (!already) {
    await header.getByRole("button", { name: "Connect wallet" }).click();
    await page.getByRole("button", { name: /Mock Connector/i }).click();
  }
  await header.getByRole("button", { name: /^0x0000…2e01$/i }).waitFor({ timeout: 30000 });
}

/** Client-side navigation through the app's own links (keeps the wallet session, like a user). */
async function nav(label) {
  await page.getByRole("navigation", { name: "App" }).getByRole("link", { name: label, exact: true }).click();
  await page.waitForLoadState("networkidle");
}

async function lastTrackerUrl() {
  if (process.env.E2E_TRACKER && phase !== "wrap" && phase !== "redeem") return process.env.E2E_TRACKER;
  return page.evaluate(() => {
    const all = JSON.parse(localStorage.getItem("musd-reach:transfers:v1") ?? "[]");
    const t = all[0];
    return t ? `/app/transfers/${t.transferId}?tx=${t.originTx}&dir=${t.direction}&seq=${t.sequence}` : null;
  });
}

try {
  await connect();
  check("mock wallet connected and restored", true);

  if (phase === "wrap") {
    await page.getByText("On Mezo").waitFor({ timeout: 30000 });
    check("portfolio reads balances for the connected account", (await page.getByText("Native sMUSD principal").count()) > 0);
    await nav("Wrap");
    await page.fill("#wrap-amount", "2");
    const btn = page.getByRole("button", { name: /Approve, then deposit|Deposit and make portable/ });
    await btn.waitFor({ timeout: 30000 });
    check("review shows expected shares", (await page.getByText("Expected shares").count()) > 0);
    await btn.click();
    await page.waitForURL(/\/app\/transfers\/0x[0-9a-f]{64}/, { timeout: 120000 });
    await page.getByText("Locked · not minted yet").waitFor({ timeout: 60000 });
    check("tracker shows locked, not minted", true);
    await page.reload({ waitUntil: "networkidle" });
    await page.getByText("Shares locked on Mezo").waitFor({ timeout: 60000 });
    check("tracker survives refresh", true);
  } else if (phase === "minted" || phase === "released") {
    const url = await lastTrackerUrl();
    await page.goto(`${BASE}${url}`, { waitUntil: "networkidle" });
    const want = phase === "minted" ? "Backed on Base" : "Released on Mezo";
    await page.getByText(want).first().waitFor({ timeout: 90000 });
    check(`tracker shows "${want}" from chain`, true);
  } else if (phase === "pending") {
    // A delivered MUSD redemption that could not settle: tracker must say so, and the recipient
    // (the connected mock account) must be able to take shares instead.
    const url = process.env.E2E_TRACKER;
    await page.goto(`${BASE}${url}`, { waitUntil: "networkidle" });
    await page.getByText("Delivered · settlement pending").waitFor({ timeout: 90000 });
    check("tracker shows delivered but settlement pending (not released)", true);
    await connect(null); // connect on this page, as the recipient would
    await page.getByText("MUSD settlement pending").first().waitFor({ timeout: 30000 });
    const take = page.getByRole("button", { name: "Take wSMUSD shares instead" });
    await take.waitFor({ timeout: 30000 });
    check("recipient sees recipient-only actions", true);
    await take.click();
    await page.getByText("Released on Mezo").first().waitFor({ timeout: 120000 });
    check("after taking shares, tracker shows released", true);
  } else if (phase === "redeem") {
    await nav("Redeem");
    await page.fill("#burn-amount", "1");
    await page.getByRole("radio", { name: /^MUSD/ }).click();
    const btn = page.getByRole("button", { name: "Burn and redeem" });
    await btn.waitFor({ timeout: 30000 });
    await btn.click();
    await page.waitForURL(/\/app\/transfers\/0x[0-9a-f]{64}/, { timeout: 120000 });
    await page.getByText("Burned · awaiting release").waitFor({ timeout: 60000 });
    check("tracker shows burned, awaiting release", true);
  }
  const url = await lastTrackerUrl();
  if (url) {
    console.log(`ORIGIN_TX=${new URL(BASE + url).searchParams.get("tx")}`);
    console.log(`TRACKER=${url}`);
  }
  await page.screenshot({ path: `${outDir}/e2e-${phase}.png`, fullPage: false });
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mp = await mobile.newPage();
  await mp.goto(`${BASE}${url ?? "/app"}`, { waitUntil: "networkidle" });
  const ov = await mp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("no horizontal overflow at 390px", ov <= 1, `overflow ${ov}px`);
  await mp.screenshot({ path: `${outDir}/e2e-${phase}-390.png` });
} catch (e) {
  check(`phase ${phase} completed`, false, e.message.split("\n")[0]);
  await page.screenshot({ path: `${outDir}/e2e-${phase}-failure.png` }).catch(() => {});
}
check("no uncaught page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close();
process.exitCode = results.every((r) => r.ok) ? 0 : 1;
