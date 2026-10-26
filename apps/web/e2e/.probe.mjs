import { chromium } from "playwright";
import { readFileSync } from "node:fs";
// Reuse the suite's fixture verbatim by extracting its install() source.
const src = readFileSync("e2e/wallet-chooser.mjs", "utf8");
const installSrc = src.slice(src.indexOf("function install("), src.indexOf("\nconst dialog"));
const install = new Function("opts", `${installSrc}; install(opts);`) ;
const wallets = [
  { name: "Rabby Wallet", rdns: "io.rabby", flag: "isRabby", address: "0x000000000000000000000000000000000000a11a" },
  { name: "MetaMask", rdns: "io.metamask", flag: "isMetaMask", address: "0x000000000000000000000000000000000000be7b" },
  { name: "Coinbase Wallet", rdns: "com.coinbase.wallet", flag: "isCoinbaseWallet", address: "0x000000000000000000000000000000000000c01b" },
];
const which = process.argv[2] ?? "eip";
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addInitScript(install, { wallets, legacy: which === "legacy" });
const p = await context.newPage();
p.on("pageerror", e => console.log("[pageerror]", e.message.slice(0, 200)));
p.on("console", m => { if (m.type() === "error") console.log("[console.error]", m.text().slice(0, 200)); });
const d = p.getByRole("dialog", { name: "Connect a wallet" });
const target = wallets[1]; // MetaMask
try {
  await p.goto("http://localhost:3002/", { waitUntil: "domcontentloaded" });
  await p.locator("header").getByRole("button", { name: "Connect wallet", exact: true }).waitFor();
  await p.locator("header").getByRole("button", { name: "Connect wallet", exact: true }).click();
  await d.waitFor();
  const rows = await d.getByRole("button").evaluateAll(els => els.map(e => ({ label: e.getAttribute("aria-label"), disabled: e.disabled })));
  console.log("rows:", JSON.stringify(rows));
  await d.getByRole("button", { name: `${target.name} \u2014 Connect`, exact: true }).click();
  await p.waitForTimeout(4000);
  console.log("requests:", JSON.stringify(await p.evaluate(() => (window.__walletRequests ?? []).map(r => `${r.wallet}:${r.method}`))));
  console.log("header text:", JSON.stringify(await p.locator("header").innerText()));
  if (await d.count()) console.log("dialog now:", JSON.stringify((await d.innerText()).slice(0, 400)));
} catch (e) { console.log("PROBE FAIL:", e.message.split("\n").slice(0, 5).join(" | ")); }
await browser.close();
