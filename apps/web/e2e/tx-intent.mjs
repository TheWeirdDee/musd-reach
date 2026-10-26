// What the app asks a wallet to sign, checked before anything could be signed. A keyless
// EIP-1193 provider answers reads from the real public RPCs for a real address (so simulations
// see real balances and allowances), records every eth_sendTransaction with the chain the wallet
// is on at that moment, and then rejects it with 4001. Nothing can be signed or sent.
//
// Checks: target contract, chain id, sender, function, exact (bounded) approval amount and
// spender, the explicit Mezo gas floor (F-20), that the on-screen review names the same spender,
// and wallet session behaviour (account switch, network change events, reload persistence).
//
//   node e2e/tx-intent.mjs [baseUrl]
import { chromium } from "playwright";
import { decodeFunctionData, erc20Abi, getAddress, parseUnits } from "viem";
import { readFileSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:3000";
const dep = JSON.parse(readFileSync(new URL("../../../deployments/testnet.json", import.meta.url), "utf8"));
const PRIMARY = "0x0F579957D94D1D12Fbb0dE3A495180629098Efe6"; // holds MUSD
const SECONDARY = "0x3a71111bb6578Beb61E39af9C09223c02b41D701"; // holds v2 wSMUSD
const MEZO_GAS_FLOOR = 1_500_000n;

const results = [];
const check = (n, ok, d = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"} ${n}${d ? ` — ${d}` : ""}`);
};

const providerScript = ({ account, startChain }) => {
  const rpcs = { 31611: "https://rpc.test.mezo.org", 84532: "https://base-sepolia-rpc.publicnode.com" };
  let chainId = startChain;
  let accounts = [account];
  const listeners = {};
  const emit = (ev, v) => (listeners[ev] ?? []).forEach((f) => f(v));
  window.__sent = [];
  window.__requests = [];
  window.__switches = [];
  window.__wallet = {
    setAccount: (a) => ((accounts = [a]), emit("accountsChanged", accounts)),
    setChain: (c) => ((chainId = c), emit("chainChanged", "0x" + c.toString(16))),
  };
  window.ethereum = {
    request: async ({ method, params }) => {
      window.__requests.push({ method, params });
      if (method === "eth_requestAccounts" || method === "eth_accounts") return accounts;
      if (method === "eth_chainId") return "0x" + chainId.toString(16);
      if (method === "net_version") return String(chainId);
      if (method === "wallet_switchEthereumChain") {
        chainId = parseInt(params[0].chainId, 16);
        window.__switches.push(chainId);
        emit("chainChanged", "0x" + chainId.toString(16));
        return null;
      }
      if (method === "wallet_addEthereumChain") return null;
      if (method === "wallet_requestPermissions" || method === "wallet_getPermissions") return [{ parentCapability: "eth_accounts" }];
      if (method === "eth_sendTransaction") {
        window.__sent.push({ ...params[0], walletChainId: chainId });
        throw Object.assign(new Error("User rejected the request."), { code: 4001 });
      }
      if (/^(eth_sign|personal_sign|eth_signTypedData.*|wallet_sendCalls)$/.test(method)) {
        throw Object.assign(new Error("User rejected the request."), { code: 4001 });
      }
      const res = await fetch(rpcs[chainId], { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
      const j = await res.json();
      if (j.error) throw Object.assign(new Error(j.error.message), { code: j.error.code, data: j.error.data });
      return j.result;
    },
    on: (ev, f) => (listeners[ev] ??= []).push(f),
    removeListener: (ev, f) => (listeners[ev] = (listeners[ev] ?? []).filter((x) => x !== f)),
  };
};

const short = (a) => new RegExp(`^${a.slice(0, 6)}…${a.slice(-4)}$`, "i");

async function withWallet(name, { account, startChain, path }, run) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultNavigationTimeout(120_000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(providerScript, { account, startChain });
  try {
    await page.goto(BASE + path, { waitUntil: "networkidle" });
    await page.locator("header").getByRole("button", { name: "Connect wallet" }).click();
    await page.getByRole("button", { name: /Browser wallet|Injected/i }).click();
    await page.locator("header").getByRole("button", { name: short(account) }).waitFor({ timeout: 30_000 });
    await run(page);
  } catch (e) {
    check(`${name}: completed`, false, e.message.split("\n")[0]);
    await page.screenshot({ path: `tx-intent-${name}-failure.png` }).catch(() => {});
  }
  check(`${name}: no uncaught page errors`, errors.length === 0, errors.join(" | "));
  await browser.close();
}

/** Clicks the primary action and returns the first transaction the wallet was asked to sign. */
async function firstRequest(page, button) {
  const networkSwitch = page.getByRole("button", { name: "Switch to Mezo testnet", exact: true });
  if (await networkSwitch.isVisible().catch(() => false)) await networkSwitch.click();
  const btn = page.getByRole("button", { name: button });
  await btn.waitFor({ timeout: 60_000 });
  await page.waitForFunction((b) => [...document.querySelectorAll("button")].some((x) => b.test(x.textContent) && !x.disabled), button, { timeout: 60_000 });
  await btn.click();
  await page.waitForFunction(() => window.__sent.length > 0, null, { timeout: 90_000 });
  await page.getByText("You rejected the request in your wallet. Nothing was sent.").first().waitFor({ timeout: 30_000 });
  return (await page.evaluate(() => window.__sent))[0];
}

function checkApproval(name, tx, { from, token, spender, amount }) {
  const call = decodeFunctionData({ abi: erc20Abi, data: tx.data });
  check(`${name}: wallet on Mezo testnet (31611) when asked to sign`, tx.walletChainId === 31611, `wallet chain ${tx.walletChainId}`);
  check(`${name}: sender is the connected account`, getAddress(tx.from) === getAddress(from));
  check(`${name}: target is the token being approved`, getAddress(tx.to) === getAddress(token), tx.to);
  check(`${name}: function is approve`, call.functionName === "approve");
  check(`${name}: spender is ${spender.slice(0, 10)}…`, getAddress(call.args[0]) === getAddress(spender), call.args[0]);
  check(`${name}: approval is exactly the entered amount (not unlimited)`, call.args[1] === amount, String(call.args[1]));
  check(`${name}: no native value attached`, !tx.value || BigInt(tx.value) === 0n);
  check(`${name}: explicit gas at or above the Mezo floor (F-20)`, !!tx.gas && BigInt(tx.gas) >= MEZO_GAS_FLOOR, tx.gas ? String(BigInt(tx.gas)) : "no gas field");
}

// 1. Wrap and make portable: MUSD approval must name the source gateway, for exactly 1.25.
await withWallet("wrap-portable", { account: PRIMARY, startChain: 31611, path: "/app/wrap" }, async (page) => {
  await page.fill("#wrap-amount", "1.25");
  await page.getByRole("radio", { name: /Make portable to Base/ }).click();
  const review = await page.locator("text=Approval scope").locator("..").innerText();
  const tx = await firstRequest(page, /Approve, then deposit/);
  checkApproval("wrap-portable", tx, { from: PRIMARY, token: dep.musd, spender: dep.sourceGateway, amount: parseUnits("1.25", 18) });
  check("wrap-portable: review shows the same spender", review.toLowerCase().includes(dep.sourceGateway.slice(2, 8).toLowerCase()), review.replace(/\s+/g, " "));
});

// 2. Wrap only: the approval must name the wrapper instead.
await withWallet("wrap-only", { account: PRIMARY, startChain: 31611, path: "/app/wrap" }, async (page) => {
  await page.fill("#wrap-amount", "0.5");
  await page.getByRole("radio", { name: /Keep wSMUSD on Mezo/ }).click();
  const review = await page.locator("text=Approval scope").locator("..").innerText();
  const tx = await firstRequest(page, /Approve, then deposit/);
  checkApproval("wrap-only", tx, { from: PRIMARY, token: dep.musd, spender: dep.wrapper, amount: parseUnits("0.5", 18) });
  check("wrap-only: review shows the same spender", review.toLowerCase().includes(dep.wrapper.slice(2, 8).toLowerCase()), review.replace(/\s+/g, " "));
});

// 3. Make portable from existing wSMUSD: the wrapper share token is approved to the source gateway.
await withWallet("lock", { account: SECONDARY, startChain: 31611, path: "/app/portable/new" }, async (page) => {
  await page.fill("#lock-amount", "0.75");
  const tx = await firstRequest(page, /Approve, then lock/);
  checkApproval("lock", tx, { from: SECONDARY, token: dep.wrapper, spender: dep.sourceGateway, amount: parseUnits("0.75", 18) });
});

// 4. Wallet on Base Sepolia: the app switches to Mezo before preparing a Mezo transaction.
await withWallet("wrong-chain", { account: PRIMARY, startChain: 84532, path: "/app/wrap" }, async (page) => {
  await page.fill("#wrap-amount", "1");
  const tx = await firstRequest(page, /Approve, then deposit/);
  const switches = await page.evaluate(() => window.__switches);
  check("wrong-chain: asked the wallet to switch to 31611 first", switches[0] === 31611, JSON.stringify(switches));
  check("wrong-chain: transaction prepared for Mezo testnet", tx.walletChainId === 31611);
});

// 5. Redeem: no address holds v2 rwSMUSD (supply 0), so a burn cannot be prepared; the action must say so.
await withWallet("redeem", { account: PRIMARY, startChain: 84532, path: "/app/redeem" }, async (page) => {
  await page.fill("#burn-amount", "1");
  await page.getByRole("button", { name: "Insufficient rwSMUSD" }).waitFor({ timeout: 60_000 });
  check("redeem: with no rwSMUSD the burn is disabled as 'Insufficient rwSMUSD'", await page.getByRole("button", { name: "Insufficient rwSMUSD" }).isDisabled());
  check("redeem: nothing was sent to the wallet", (await page.evaluate(() => window.__sent.length)) === 0);
});

// 6. Session: account switch, network change and reload persistence.
await withWallet("session", { account: PRIMARY, startChain: 31611, path: "/app" }, async (page) => {
  await page.evaluate((a) => window.__wallet.setAccount(a), SECONDARY);
  await page.locator("header").getByRole("button", { name: short(SECONDARY) }).waitFor({ timeout: 15_000 });
  check("session: header follows an account switch in the wallet", true);
  await page.evaluate(() => window.__wallet.setChain(84532));
  await page.locator("header").getByRole("button", { name: short(SECONDARY) }).click();
  await page.getByText(/Base Sepolia/).first().waitFor({ timeout: 15_000 });
  check("session: network badge follows a chain change in the wallet", true);
  await page.evaluate(() => window.__wallet.setChain(1));
  await page.getByText("Unsupported (1)").first().waitFor({ timeout: 15_000 });
  check("session: switching the wallet to an unsupported chain is reported", true);
  // A wallet on another network with no balance has every action disabled; the menu must offer the way back.
  await page.getByRole("button", { name: "Switch to Mezo testnet" }).click();
  await page.getByText("Mezo testnet", { exact: true }).first().waitFor({ timeout: 15_000 });
  check("session: menu 'Switch to Mezo testnet' asks the wallet for 31611 and the badge follows", (await page.evaluate(() => window.__switches)).at(-1) === 31611);
  await page.keyboard.press("Escape");
  await page.reload({ waitUntil: "networkidle" });
  // The scripted wallet restarts with its initial account on reload; the app must reconnect to it unprompted.
  await page.locator("header").getByRole("button", { name: short(PRIMARY) }).waitFor({ timeout: 30_000 });
  check("session: no connect prompt needed after reload", (await page.locator("header").getByRole("button", { name: "Connect wallet" }).count()) === 0);
  check("session: connection persists across a reload", true);
});

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
