// Development-only keyless browser fixtures. All RPC replies are explicitly test data.
// Every write/signature is rejected in the provider and never forwarded to any RPC.
import { chromium } from "playwright";
import { decodeFunctionData, encodeFunctionResult, erc20Abi, parseAbi, parseEther, toHex } from "viem";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
const BASE = process.argv[2] ?? "http://localhost:3003";
const OUT = "../../evidence/product-review/wallet-states";
mkdirSync(OUT, { recursive: true });
const ACCOUNT = "0x000000000000000000000000000000000000c0de";
const SECOND = "0x000000000000000000000000000000000000beef";
const deployment = JSON.parse(readFileSync("../../deployments/testnet.json", "utf8"));
const abis = [erc20Abi, ...["ReachSavingsWrapper", "ReachSourceGateway", "ReachDestinationGateway"].map((name) => JSON.parse(readFileSync(`../../packages/contracts/out/${name}.sol/${name}.json`, "utf8")).abi)];
abis.push(parseAbi(["function getEthBalance(address addr) view returns (uint256)"]));
const multicall = parseAbi(["function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[] returnData)"]);
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); };
const provider = ({ account, chainId, rejectSwitch, pendingSign, announce }) => {
  let current = chainId, accounts = [account], authorized = false; const listeners = {};
  const emit = (event, v) => (listeners[event] ?? []).forEach((f) => f(v));
  window.__requests = []; window.__signs = 0;
  window.__changeAccount = (a) => { accounts = [a]; emit("accountsChanged", accounts); };
  const reject = () => Object.assign(new Error("User rejected the request."), { code: 4001 });
  const wallet = { request: async ({ method, params }) => {
    window.__requests.push({ method, params, chainId: current });
    if (method === "eth_accounts") return authorized ? accounts : [];
    if (method === "eth_requestAccounts") { authorized = true; return accounts; }
    if (method === "eth_chainId") return toChain();
    if (method === "net_version") return String(current);
    if (method === "wallet_getPermissions" || method === "wallet_requestPermissions") return [{ parentCapability: "eth_accounts" }];
    if (method === "wallet_switchEthereumChain") { if (rejectSwitch) throw reject(); current = Number.parseInt(params[0].chainId, 16); emit("chainChanged", toChain()); return null; }
    if (method === "wallet_addEthereumChain") return null;
    if (/^(eth_sendTransaction|eth_sign|personal_sign|eth_signTypedData.*|wallet_sendCalls)$/.test(method)) {
      window.__signs++;
      if (pendingSign) return new Promise((_, rejectPending) => { window.__rejectPending = () => rejectPending(reject()); });
      throw reject();
    }
    throw Object.assign(new Error(`Unsupported fixture method: ${method}`), { code: 4200 });
  }, on: (event, f) => (listeners[event] ??= []).push(f), removeListener: (event, f) => { listeners[event] = (listeners[event] ?? []).filter((x) => x !== f); } };
  const toChain = () => `0x${current.toString(16)}`;
  window.ethereum = wallet;
  if (announce) { const send = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: { info: { uuid: "00000000-0000-4000-8000-000000000001", name: "Test Wallet", icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>", rdns: "org.example.testwallet" }, provider: wallet } })); window.addEventListener("eip6963:requestProvider", send); send(); }
};
const browser = await chromium.launch();
async function scenario(name, options, run) {
  if (process.env.WALLET_SCENARIOS && !process.env.WALLET_SCENARIOS.split(",").includes(name)) return;
  const cfg = { zero: false, gas: parseEther("1"), failRpc: false, account: ACCOUNT, chainId: 31611, rejectSwitch: false, pendingSign: false, announce: false, allowance: false, ...options };
  const context = await browser.newContext({ viewport: { width: options.width ?? 1280, height: options.width ? 844 : 900 } });
  const errors = [];
  await context.addInitScript(provider, { ...cfg, gas: undefined });
  await context.route(/https:\/\/(rpc\.test\.mezo\.org|base-sepolia-rpc\.publicnode\.com|sepolia\.base\.org)\/?/, async (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 200, body: "", headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" } });
    const request = route.request().postDataJSON();
    const reply = (req) => {
      const fail = { jsonrpc: "2.0", id: req.id, error: { code: -32000, message: "RPC unavailable (test fixture)" } };
      if (cfg.failRpc) return fail;
      let result = "0x0";
      if (req.method === "eth_blockNumber") result = "0x1000000";
      else if (req.method === "eth_chainId") result = route.request().url().includes("mezo") ? "0x7b7b" : "0x14a34";
      else if (req.method === "eth_getBalance") result = toHex(cfg.gas);
      else if (req.method === "eth_gasPrice" || req.method === "eth_maxPriorityFeePerGas") result = toHex(1_000_000_000n);
      else if (req.method === "eth_estimateGas") result = toHex(500_000n);
      else if (req.method === "eth_getCode") result = "0x60006000";
      else if (req.method === "eth_getStorageAt") result = `0x${deployment.nativeVaultImplementation.slice(2).padStart(64, "0")}`;
      else if (req.method === "eth_call") {
        const data = req.params[0].data;
        let encoded;
        try {
          const batch = decodeFunctionData({ abi: multicall, data });
          const values = batch.args[0].map((call) => ({ success: true, returnData: reply({ ...req, params: [{ to: call.target, data: call.callData }, req.params[1]] }).result }));
          encoded = encodeFunctionResult({ abi: multicall, functionName: "aggregate3", result: values });
        } catch { /* an ordinary contract read */ }
        for (const abi of abis) {
          if (encoded) break;
          try {
            const call = decodeFunctionData({ abi, data });
            let value = 0n;
            if (call.functionName === "getEthBalance") value = cfg.gas;
            else if (call.functionName === "balanceOf") value = cfg.zero || String(call.args[0]).toLowerCase() === SECOND ? 0n : parseEther("100");
            else if (call.functionName === "allowance") value = cfg.allowance ? parseEther("1000") : 0n;
            else if (["convertToAssets", "previewDeposit", "previewDepositSavings", "previewRedeem"].includes(call.functionName)) value = call.args[0];
            else if (["yieldIndex", "supplyYieldIndex", "assetsPerShare"].includes(call.functionName)) value = parseEther("1");
            else if (["totalAssets", "totalSupply", "principal"].includes(call.functionName)) value = parseEther("1000");
            const fn = abi.find((x) => x.type === "function" && x.name === call.functionName);
            const values = (fn.outputs ?? []).map((o) => o.type === "bool" ? call.functionName === "approve" : o.type === "address" ? "0x0000000000000000000000000000000000000000" : o.type === "bytes32" ? `0x${"0".repeat(64)}` : value);
            encoded = encodeFunctionResult({ abi, functionName: call.functionName, result: values.length === 1 ? values[0] : values });
            break;
          } catch { /* selector belongs to another ABI */ }
        }
        result = encoded ?? `0x${"0".repeat(64)}`;
      } else if (/send|sign/i.test(req.method)) throw new Error(`Forbidden RPC write: ${req.method}`);
      return { jsonrpc: "2.0", id: req.id, result };
    };
    await route.fulfill({ json: Array.isArray(request) ? request.map(reply) : reply(request), headers: { "access-control-allow-origin": "*" } });
  });
  await context.route("https://musd-reach-api.onrender.com/**", (route) => route.fulfill({ status: 502, json: { error: "Fixture API unavailable" }, headers: { "access-control-allow-origin": "*" } }));
  const page = await context.newPage(); page.setDefaultNavigationTimeout(120_000); page.on("pageerror", (e) => errors.push(e.message));
  const connect = async (path = "/app/wrap") => { await page.goto(BASE + path, { waitUntil: "networkidle" }); if (options.width) await page.getByRole("button", { name: "Open menu", exact: true }).click(); await page.locator("header").getByRole("button", { name: "Connect wallet" }).click(); await page.getByRole("button", { name: cfg.announce ? "Test Wallet" : /Browser wallet|Injected/ }).click(); await page.locator("header").getByRole("button", { name: /^0x0000…c0de$/i }).waitFor({ timeout: 30_000 }); if (options.width) await page.getByRole("button", { name: "Close menu", exact: true }).click(); };
  try { await run({ page, connect, cfg, context }); await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true }); }
  catch (e) { check(`${name}: completed`, false, e.message); writeFileSync(`${OUT}/${name}-failure.txt`, await page.locator("body").innerText()); await page.screenshot({ path: `${OUT}/${name}-failure.png`, fullPage: true }).catch(() => {}); }
  check(`${name}: no uncaught page errors`, errors.length === 0, errors.join(" | "));
  await context.close();
}
try {
  await scenario("disconnected", {}, async ({ page }) => { await page.goto(BASE + "/app/wrap"); check("Disconnected forms show onboarding instead of a live transaction", await page.locator("#wrap-amount").count() === 0 && await page.getByText("What happens", { exact: true }).count() === 1); check("Disconnected page makes no signing requests", await page.evaluate(() => window.__signs) === 0); });
  await scenario("sufficient-and-rejected", {}, async ({ page, connect }) => { await connect(); await page.fill("#wrap-amount", "1"); const action = page.getByRole("button", { name: "Approve, then deposit", exact: true }); await action.waitFor(); await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent === "Approve, then deposit" && !b.disabled)); check("Sufficient token and gas balances enable the exact next action", await action.isEnabled()); await page.fill("#recipient", "0x0000000000000000000000000000000000000000"); check("Zero recipient is rejected", await page.getByRole("button", { name: "Check recipient address", exact: true }).isDisabled()); await page.fill("#recipient", ACCOUNT); await action.click(); await page.getByText("You rejected the request in your wallet. Nothing was sent.").first().waitFor(); check("Rejected signature is recoverable and never navigates to a tracker", await action.isEnabled() && !page.url().includes("/transfers/")); const requests = await page.evaluate(() => window.__requests); check("No permit, typed-data or personal signature was requested", !requests.some((r) => /eth_sign|personal_sign/.test(r.method))); writeFileSync(`${OUT}/connection-requests.json`, JSON.stringify(requests, null, 2)); });
  await scenario("wrong-network", { chainId: 84532 }, async ({ page, connect }) => { await connect(); await page.fill("#wrap-amount", "1"); const action = page.getByRole("button", { name: "Approve, then deposit", exact: true }); check("Wrong network keeps the financial action disabled", await action.isDisabled()); await page.getByRole("button", { name: "Switch to Mezo testnet", exact: true }).click(); await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent === "Approve, then deposit" && !b.disabled)); check("Explicit network switch restores eligibility without signing", await action.isEnabled() && await page.evaluate(() => window.__signs) === 0); });
  await scenario("rejected-switch", { chainId: 84532, rejectSwitch: true }, async ({ page, connect }) => { await connect(); await page.fill("#wrap-amount", "1"); await page.getByRole("button", { name: "Switch to Mezo testnet", exact: true }).click(); await page.getByText("Network switch rejected. Nothing was sent.").waitFor(); check("Rejected switch leaves no signing request", await page.evaluate(() => window.__signs) === 0); });
  await scenario("zero-token", { zero: true }, async ({ page, connect }) => { await connect(); await page.fill("#wrap-amount", "1"); await page.getByRole("button", { name: "Insufficient balance", exact: true }).waitFor(); check("Zero token balance is shown and blocks the action", await page.getByRole("button", { name: "Insufficient balance", exact: true }).isDisabled()); });
  await scenario("zero-gas", { gas: 0n }, async ({ page, connect }) => { await connect(); await page.fill("#wrap-amount", "1"); await page.getByText(/Next transaction budget:/).waitFor(); check("Gas shortage is displayed and blocks the action", await page.getByRole("button", { name: "Insufficient network gas", exact: true }).isDisabled() && await page.getByText(/Available: 0 BTC/).count() === 1); });
  await scenario("rpc-unavailable", { failRpc: true }, async ({ page, connect }) => { await connect(); await page.fill("#wrap-amount", "1"); await page.getByText(/Could not fetch a quote/).waitFor({ timeout: 30_000 }); check("RPC failure cannot enable a write with assumed balances", await page.getByRole("button", { name: /Balance read unavailable|Reading balances|Estimate unavailable/ }).isDisabled()); });
  await scenario("pending-request", { pendingSign: true }, async ({ page, connect }) => { await connect(); await page.fill("#wrap-amount", "1"); const action = page.getByRole("button", { name: "Approve, then deposit", exact: true }); await action.click(); await page.waitForFunction(() => window.__signs === 1); check("Pending wallet request freezes input and action", await action.isDisabled() && await page.locator("#wrap-amount").isDisabled()); await page.evaluate(() => { [...document.querySelectorAll("button")].find((b) => b.textContent === "Approve, then deposit").click(); }); check("Pending action cannot submit twice", await page.evaluate(() => window.__signs) === 1); await page.evaluate(() => window.__rejectPending()); await page.getByText("You rejected the request in your wallet. Nothing was sent.").first().waitFor(); });
  await scenario("account-switch", {}, async ({ page, connect }) => { await connect(); await page.fill("#wrap-amount", "1"); await page.evaluate((a) => window.__changeAccount(a), SECOND); await page.locator("header").getByRole("button", { name: /^0x0000…beef$/i }).waitFor(); await page.getByRole("button", { name: "Insufficient balance", exact: true }).waitFor(); check("Account switching refreshes account-specific eligibility", await page.getByRole("button", { name: "Insufficient balance", exact: true }).isDisabled()); });
  await scenario("direct-lock-intent", { allowance: true }, async ({ page, connect }) => {
    await connect("/app/portable/new"); await page.fill("#lock-amount", "1");
    await page.getByRole("button", { name: "Lock and make portable", exact: true }).click();
    await page.getByText("You rejected the request in your wallet. Nothing was sent.").first().waitFor();
    const requests = await page.evaluate(() => window.__requests); const tx = requests.find((r) => r.method === "eth_sendTransaction");
    const call = decodeFunctionData({ abi: abis[2], data: tx.params[0].data });
    check("Lock intent binds v2 source gateway, Mezo chain and exact share amount", tx.chainId === 31611 && tx.params[0].to.toLowerCase() === deployment.sourceGateway.toLowerCase() && call.functionName === "lockAndIssue" && call.args[0] === parseEther("1"));
  });
  await scenario("burn-intent", { chainId: 84532 }, async ({ page, connect }) => {
    await connect("/app/redeem"); await page.fill("#burn-amount", "1");
    await page.getByRole("button", { name: "Burn and redeem", exact: true }).click();
    await page.getByText("You rejected the request in your wallet. Nothing was sent.").first().waitFor();
    const requests = await page.evaluate(() => window.__requests); const tx = requests.find((r) => r.method === "eth_sendTransaction");
    const call = decodeFunctionData({ abi: abis[3], data: tx.params[0].data });
    check("Burn intent binds v2 destination gateway, Base chain and exact receipt amount", tx.chainId === 84532 && tx.params[0].to.toLowerCase() === deployment.destinationGateway.toLowerCase() && call.functionName === "burnAndRedeem" && call.args[0] === parseEther("1"));
    check("Burn requires no token approval or typed signature", !requests.some((r) => /eth_sign|personal_sign/.test(r.method)) && requests.filter((r) => r.method === "eth_sendTransaction").length === 1);
  });
  await scenario("mobile-input", { width: 390 }, async ({ page, connect }) => {
    await connect(); await page.fill("#wrap-amount", "1e3");
    check("Malformed amount is preserved and cannot enable a write", await page.locator("#wrap-amount").inputValue() === "1e3" && await page.getByRole("button", { name: "Enter an amount", exact: true }).isDisabled());
    await page.fill("#wrap-amount", "1");
    await page.getByRole("button", { name: "Approve, then deposit", exact: true }).waitFor();
    check("Connected mobile workspace has no page overflow", await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  });
  await scenario("chooser", { announce: true }, async ({ page }) => { await page.goto(BASE + "/app"); await page.locator("header").getByRole("button", { name: "Connect wallet" }).click(); const names = await page.getByRole("dialog", { name: "Wallet" }).getByRole("button").allTextContents(); check("EIP-6963 wallet is listed once without generic duplicate", names.filter((n) => n === "Test Wallet").length === 1 && !names.includes("Browser wallet")); });
} finally { await browser.close(); writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2)); }
const passed = results.filter((r) => r.ok).length; console.log(`${passed}/${results.length} passed`); process.exitCode = passed === results.length ? 0 : 1;
