import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const src = readFileSync("e2e/wallet-chooser.mjs", "utf8");
const installSrc = src.slice(src.indexOf("function install("), src.indexOf("\nconst dialog"));
const install = new Function("opts", `${installSrc}; install(opts);`);
const wallets = [
  { name: "Rabby Wallet", rdns: "io.rabby", flag: "isRabby", address: "0x000000000000000000000000000000000000a11a" },
  { name: "MetaMask", rdns: "io.metamask", flag: "isMetaMask", address: "0x000000000000000000000000000000000000be7b" },
];
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addInitScript(install, { wallets });
const p = await context.newPage();
p.on("pageerror", e => console.log("[pageerror]", e.message.slice(0, 160)));
const d = p.getByRole("dialog", { name: "Connect a wallet" });
const t = p.locator("header").getByRole("button", { name: "Connect wallet", exact: true });
const state = async tag => console.log(tag, JSON.stringify(await d.getByRole("button").evaluateAll(els => els.map(e => ({ t: e.textContent.trim().slice(0, 34), dis: e.disabled })))));
try {
  await p.goto("http://localhost:3002/", { waitUntil: "domcontentloaded" });
  await t.waitFor(); await t.click(); await d.waitFor();
  await d.getByRole("button", { name: "MetaMask — Connect", exact: true }).click();
  await p.locator("header").getByRole("button", { name: /^0x0000.(be7b)$/i }).waitFor({ timeout: 20000 });
  console.log("connected");
  await p.locator("header").getByRole("button", { name: /^0x0000.(be7b)$/i }).click();
  await d.getByText("Unsupported (1)", { exact: true }).waitFor();
  console.log("unsupported chip ok");
  await p.evaluate(() => window.__walletControls["io.metamask"].rejectSwitch(true));
  await d.getByRole("button", { name: "Switch to Mezo testnet", exact: true }).click();
  await d.getByRole("alert").waitFor();
  console.log("rejected switch alert:", JSON.stringify(await d.getByRole("alert").innerText()));
  await p.evaluate(() => window.__walletControls["io.metamask"].rejectSwitch(false));
  await d.getByRole("button", { name: "Switch to Mezo testnet", exact: true }).click();
  await d.getByText("Mezo testnet", { exact: true }).waitFor({ timeout: 15000 });
  console.log("now on Mezo");
  await state("buttons after Mezo:");
  const base = d.getByRole("button", { name: "Switch to Base Sepolia", exact: true });
  console.log("base count:", await base.count());
  try { await base.click({ timeout: 12000 }); console.log("base clicked"); }
  catch (e) { console.log("BASE CLICK FAIL:", e.message.split("\n").slice(0, 6).join(" | ")); await state("state at failure:"); }
  await p.waitForTimeout(1500);
  console.log("dialog text:", JSON.stringify((await d.innerText()).slice(0, 500)));
} catch (e) { console.log("PROBE FAIL:", e.message.split("\n").slice(0, 6).join(" | ")); }
await browser.close();
