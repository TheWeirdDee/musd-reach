// Deterministic browser regressions for settlement-read failures and paginated history.
// RPC/API replies are fixtures; no wallet can sign. Run against the patched app with its API configured:
// node e2e/settlement-history.mjs [baseUrl] [apiUrl]
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { encodeAbiParameters, toFunctionSelector } from "viem";

const BASE = process.argv[2] ?? "http://localhost:3000";
const API = process.argv[3] ?? "https://musd-reach-api.onrender.com";
const ACCOUNT = "0x0000000000000000000000000000000000002e01";
const id = (n) => `0x${n.toString(16).padStart(64, "0")}`;
const pendingSelector = toFunctionSelector("pendingSettlements(bytes32)");
const consumedSelector = toFunctionSelector("transferConsumed(bytes32)");
const browser = await chromium.launch();
let passed = 0;
const check = (name, ok) => { assert.ok(ok, name); passed++; console.log(`PASS ${name}`); };
try {
  const ctx = await browser.newContext();
  let settlement = "loading";
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  await ctx.route(/https:\/\/(rpc\.test\.mezo\.org|base-sepolia-rpc\.publicnode\.com|sepolia\.base\.org)\/?/, async (route) => {
    const requests = route.request().postDataJSON();
    const respond = async (req) => {
      let result = "0x0";
      if (req.method === "eth_call") {
        const data = req.params[0].data;
        if (data.startsWith(consumedSelector)) result = encodeAbiParameters([{ type: "bool" }], [true]);
        else if (data.startsWith(pendingSelector)) {
          if (settlement === "loading") await gate;
          // Empty return data causes a decode failure, without transport retries masking it.
          result = settlement === "error" ? "0x" : encodeAbiParameters(
            [{ type: "address" }, { type: "uint256" }, { type: "uint256" }],
            [ACCOUNT, settlement === "pending" ? 10n ** 18n : 0n, 1n],
          );
        }
      } else if (req.method === "eth_getTransactionReceipt") result = null;
      else if (req.method === "eth_chainId") result = route.request().url().includes("mezo") ? "0x7b7b" : "0x14a34";
      return { jsonrpc: "2.0", id: req.id, result };
    };
    const response = Array.isArray(requests) ? await Promise.all(requests.map(respond)) : await respond(requests);
    await route.fulfill({ json: response, headers: { "access-control-allow-origin": "*" } });
  });
  const page = await ctx.newPage();
  const tracker = `${BASE}/app/transfers/${id(1)}?tx=${id(2)}&dir=REDEEM`;
  await page.goto(tracker);
  await page.getByText("Checking settlement status", { exact: true }).waitFor();
  check("loading settlement never reports settled", await page.getByText("Settled on the target chain", { exact: true }).count() === 0);
  settlement = "error";
  release();
  await page.getByText("Settlement status unavailable", { exact: true }).waitFor({ timeout: 30_000 });
  check("failed settlement read never reports settled", await page.getByText("Settled on the target chain", { exact: true }).count() === 0);
  settlement = "pending";
  await page.reload();
  await page.getByText("Delivered · settlement pending", { exact: true }).waitFor();
  check("pending shares are shown as pending", await page.getByText("Settled on the target chain", { exact: true }).count() === 0);
  settlement = "settled";
  await page.reload();
  await page.getByText("Settled on the target chain", { exact: true }).waitFor();
  check("successful zero-pending read confirms settlement", true);
  await ctx.close();

  // The connected history fixture can be skipped with SETTLEMENT_ONLY when only tracker reads
  // are wanted (for example against a hosted build).
  if (!process.env.SETTLEMENT_ONLY) {
  const historyCtx = await browser.newContext();
  await historyCtx.addInitScript((account) => {
    window.ethereum = {
      request: async ({ method }) => {
        if (method === "eth_accounts" || method === "eth_requestAccounts") return [account];
        if (method === "eth_chainId") return "0x7b7b";
        if (method === "wallet_getPermissions" || method === "wallet_requestPermissions") return [{ parentCapability: "eth_accounts" }];
        throw Object.assign(new Error("Rejected"), { code: 4001 });
      },
      on() {}, removeListener() {},
    };
  }, ACCOUNT);
  let cursorSeen = false;
  await historyCtx.route(`${API}/v1/transfers?**`, async (route) => {
    const url = new URL(route.request().url());
    const cursor = url.searchParams.get("cursor");
    cursorSeen ||= cursor === `1000:${id(50)}`;
    const numbers = cursor ? [51] : Array.from({ length: 50 }, (_, i) => i + 1);
    await route.fulfill({ json: {
      transfers: numbers.map((n) => ({ transfer_id: id(n), direction: "ISSUE", status: "BACKED_REMOTE", shares: "1000000000000000000", origin_tx: id(n + 100), origin_block: 1, recipient: ACCOUNT, wormhole_sequence: `${n}`, musd_out: null })),
      nextCursor: cursor ? null : `1000:${id(50)}`,
    }, headers: { "access-control-allow-origin": new URL(BASE).origin } });
  });
  const history = await historyCtx.newPage();
  await history.goto(`${BASE}/app/history`);
  await history.locator("header").getByRole("button", { name: "Connect wallet" }).click();
  await history.getByRole("button", { name: /Browser wallet|Injected/i }).click();
  await history.getByRole("button", { name: "Load older transfers" }).waitFor();
  check("history displays the first 50 transfers", await history.locator("tbody tr").count() === 50);
  await history.getByRole("button", { name: "Load older transfers" }).click();
  await history.locator("tbody tr").nth(50).waitFor();
  check("history loads transfer 51 with the server cursor", cursorSeen && await history.locator("tbody tr").count() === 51);
  check("history hides load-more at the end", await history.getByRole("button", { name: "Load older transfers" }).count() === 0);
  await historyCtx.close();
  } else console.log("Connected history fixture skipped: SETTLEMENT_ONLY is set.");
  console.log(`${passed}/${passed} passed`);
} finally {
  await browser.close();
}
