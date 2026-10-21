// Rejected-signature and rejected-network-switch behaviour through wagmi's real *injected*
// connector (the path MetaMask/Rabby use). A scripted EIP-1193 provider is installed as
// window.ethereum: reads are forwarded to the real public RPCs, and every signing request or
// chain switch is rejected with code 4001, exactly as a wallet does when the user clicks
// "Reject". It holds no key, so nothing can ever be signed or sent.
//
//   node e2e/rejection.mjs [baseUrl] [account]
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:3000";
const ACCOUNT = process.argv[3] ?? "0x0F579957D94D1D12Fbb0dE3A495180629098Efe6";
const results = [];
const check = (n, ok, d = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"} ${n}${d ? ` — ${d}` : ""}`);
};

const providerScript = ({ account, startChain, rejectSwitch }) => {
  const rpcs = { 31611: "https://rpc.test.mezo.org", 84532: "https://base-sepolia-rpc.publicnode.com" };
  let chainId = startChain;
  const listeners = {};
  const emit = (ev, v) => (listeners[ev] ?? []).forEach((f) => f(v));
  const reject = (what) => Object.assign(new Error(`User rejected the request (${what}).`), { code: 4001 });
  window.__signRequests = 0;
  window.ethereum = {
    isMetaMask: false,
    request: async ({ method, params }) => {
      if (method === "eth_requestAccounts" || method === "eth_accounts") return [account];
      if (method === "eth_chainId") return "0x" + chainId.toString(16);
      if (method === "net_version") return String(chainId);
      if (method === "wallet_switchEthereumChain") {
        if (rejectSwitch) throw reject("switch network");
        chainId = parseInt(params[0].chainId, 16);
        emit("chainChanged", "0x" + chainId.toString(16));
        return null;
      }
      if (method === "wallet_addEthereumChain") return null;
      if (/^(eth_sendTransaction|eth_sign|personal_sign|eth_signTypedData.*|wallet_sendCalls)$/.test(method)) {
        window.__signRequests++;
        throw reject(method);
      }
      if (method === "wallet_requestPermissions" || method === "wallet_getPermissions") return [{ parentCapability: "eth_accounts" }];
      const res = await fetch(rpcs[chainId], { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
      const j = await res.json();
      if (j.error) throw Object.assign(new Error(j.error.message), { code: j.error.code, data: j.error.data });
      return j.result;
    },
    on: (ev, f) => ((listeners[ev] ??= []).push(f)),
    removeListener: (ev, f) => (listeners[ev] = (listeners[ev] ?? []).filter((x) => x !== f)),
  };
};

async function scenario(name, opts, run) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(providerScript, { account: ACCOUNT, ...opts });
  try {
    await page.goto(`${BASE}/app/wrap`, { waitUntil: "networkidle" });
    await page.locator("header").getByRole("button", { name: "Connect wallet" }).click();
    await page.getByRole("button", { name: /Browser wallet|Injected/i }).click();
    await page.locator("header").getByRole("button", { name: /^0x0F57…Efe6$/i }).waitFor({ timeout: 30000 });
    check(`${name}: injected wallet connected`, true);
    await run(page);
  } catch (e) {
    check(`${name}: completed`, false, e.message.split("\n")[0]);
    await page.screenshot({ path: `rejection-${name}-failure.png` }).catch(() => {});
  }
  check(`${name}: no uncaught page errors`, errors.length === 0, errors.join(" | "));
  await browser.close();
}

await scenario("reject-signature", { startChain: 31611, rejectSwitch: false }, async (page) => {
  await page.fill("#wrap-amount", "1");
  const btn = page.getByRole("button", { name: /Approve, then deposit|Deposit and make portable/ });
  await btn.waitFor({ timeout: 60000 });
  await btn.click();
  await page.getByText("You rejected the request in your wallet. Nothing was sent.").first().waitFor({ timeout: 60000 });
  check("reject-signature: UI states the rejection and that nothing was sent", true);
  check("reject-signature: step shows 'Rejected in wallet', not success", (await page.getByText("Rejected in wallet").count()) > 0 && (await page.getByText("Done").count()) === 0);
  check("reject-signature: no navigation to a tracker", !/\/app\/transfers\//.test(page.url()));
  check("reject-signature: action can be retried", await btn.isEnabled());
  check("reject-signature: exactly one signing request reached the wallet", (await page.evaluate(() => window.__signRequests)) === 1);
});

await scenario("reject-switch", { startChain: 84532, rejectSwitch: true }, async (page) => {
  await page.fill("#wrap-amount", "1");
  const btn = page.getByRole("button", { name: /Approve, then deposit|Deposit and make portable/ });
  await btn.waitFor({ timeout: 60000 });
  await btn.click();
  await page.getByText("You rejected the request in your wallet. Nothing was sent.").first().waitFor({ timeout: 60000 });
  check("reject-switch: wrong network + rejected switch is reported, nothing signed", (await page.evaluate(() => window.__signRequests)) === 0);
});

// A fresh MetaMask sits on Ethereum mainnet, which is not in the wagmi config. The badge must
// report the wallet's real chain, and the action must still ask to switch (F-17).
await scenario("unsupported-chain", { startChain: 1, rejectSwitch: true }, async (page) => {
  await page.locator("header").getByRole("button", { name: /^0x0F57…Efe6$/i }).click();
  check("unsupported-chain: badge reports the wallet's real chain", (await page.getByText("Unsupported (1)").count()) > 0);
  await page.keyboard.press("Escape");
  await page.fill("#wrap-amount", "1");
  const btn = page.getByRole("button", { name: /Approve, then deposit|Deposit and make portable/ });
  await btn.waitFor({ timeout: 60000 });
  await btn.click();
  await page.getByText("You rejected the request in your wallet. Nothing was sent.").first().waitFor({ timeout: 60000 });
  check("unsupported-chain: action asks to switch and reports the rejected switch, nothing signed", (await page.evaluate(() => window.__signRequests)) === 0);
});

process.exitCode = results.every(Boolean) ? 0 : 1;
