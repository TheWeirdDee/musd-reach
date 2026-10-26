/** Runs browser signing flows on localhost forks of the recorded public deployment.
 * Prerequisites: Anvil :8545/:8546 with --auto-impersonate; Next dev :3001 configured
 * for these forks and NEXT_PUBLIC_E2E_ACCOUNT=0x0000000000000000000000000000000000002e01.
 * No public signing key is used. Refuses to fund or transact unless both clients are Anvil.
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createWalletClient, decodeEventLog, erc20Abi, http, maxUint256, parseEther, type Hex, type TransactionReceipt } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { reachDestinationGatewayAbi, reachSourceGatewayAbi, reachEvents } from "@musd-reach/sdk";
import { makeEnv, obtainVaa, overrideForkGuardian, publishedFrom, ROOT } from "./lib/env.js";

const account = "0x0000000000000000000000000000000000002e01" as const;
const holder = "0x0F579957D94D1D12Fbb0dE3A495180629098Efe6" as const;
const outDir = resolve(ROOT, process.argv[2] ?? "evidence/fork-rehearsal/browser-review-2026-10-25");
mkdirSync(outDir, { recursive: true });
process.env.REACH_DEPLOYMENTS = resolve(ROOT, "deployments/testnet.json");
process.env.REACH_FORK_GUARDIAN_KEY = generatePrivateKey();
const env = makeEnv("fork");
const d = env.cfg.deployment!;
for (const c of [env.mezo, env.base]) {
  const version = await c.request({ method: "web3_clientVersion" as never });
  if (!String(version).toLowerCase().includes("anvil")) throw new Error("Refusing: both RPCs must be local Anvil forks");
  await c.request({ method: "anvil_setBalance" as never, params: [account, `0x${parseEther("100").toString(16)}`] as never });
}
const guardian = privateKeyToAccount(env.localGuardianKey!).address;
const mezoIndex = await overrideForkGuardian(env.mezo, env.cfg.mezo.wormholeCore, guardian);
const baseIndex = await overrideForkGuardian(env.base, env.cfg.base.wormholeCore, guardian);
const mezoWallet = createWalletClient({ account, chain: env.cfg.mezo.chain, transport: http("http://127.0.0.1:8545") });
const baseWallet = createWalletClient({ account, chain: env.cfg.base.chain, transport: http("http://127.0.0.1:8546") });
const funding = createWalletClient({ account: holder, chain: env.cfg.mezo.chain, transport: http("http://127.0.0.1:8545") });
await env.mezo.request({ method: "anvil_setBalance" as never, params: [holder, `0x${parseEther("10").toString(16)}`] as never });
const fundTx = await funding.writeContract({ address: env.cfg.mezo.musd, abi: erc20Abi, functionName: "transfer", args: [account, parseEther("5")], gas: 1_500_000n });
if ((await env.mezo.waitForTransactionReceipt({ hash: fundTx })).status !== "success") throw new Error("Local funding failed");

async function phase(name: string, tracker?: string) {
  const output = await new Promise<string>((resolveOutput, reject) => {
    const child = spawn(process.execPath, ["apps/web/e2e/fork-flows.mjs", name, outDir], {
      cwd: ROOT, env: { ...process.env, E2E_URL: "http://localhost:3001", E2E_TRACKER: tracker ?? "" },
      windowsHide: true,
    });
    let text = "";
    child.stdout.on("data", (v) => { text += v; process.stdout.write(v); });
    child.stderr.on("data", (v) => { text += v; process.stderr.write(v); });
    child.on("error", reject);
    child.on("close", (code) => {
      writeFileSync(resolve(outDir, `${name}.txt`), text);
      if (code) reject(new Error(`Browser phase ${name} failed (${code})`));
      else resolveOutput(text);
    });
  });
  return {
    tx: output.match(/^ORIGIN_TX=(0x[0-9a-f]+)$/m)?.[1] as Hex,
    tracker: output.match(/^TRACKER=(.+)$/m)?.[1],
  };
}

async function deliver(tx: Hex, issue: boolean) {
  const origin = issue ? env.mezo : env.base;
  const receipt = await origin.getTransactionReceipt({ hash: tx });
  const msg = await publishedFrom(origin, receipt, issue ? env.cfg.mezo.wormholeCore : env.cfg.base.wormholeCore);
  const { vaa } = await obtainVaa(env, issue ? env.cfg.mezo.wormholeChainId : env.cfg.base.wormholeChainId, msg, issue ? baseIndex : mezoIndex);
  const hash = issue
    ? await baseWallet.writeContract({ address: d.destinationGateway, abi: reachDestinationGatewayAbi, functionName: "receiveIssue", args: [vaa], gas: 3_000_000n })
    : await mezoWallet.writeContract({ address: d.sourceGateway, abi: reachSourceGatewayAbi, functionName: "receiveRedeem", args: [vaa], gas: 3_000_000n });
  const r = await (issue ? env.base : env.mezo).waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error("Local delivery reverted");
  console.log(`PASS local ${issue ? "ISSUE" : "REDEEM"} delivery ${hash}`);
}

const wrapped = await phase("wrap");
await deliver(wrapped.tx, true);
await phase("minted", wrapped.tracker);
const redeemed = await phase("redeem");
await deliver(redeemed.tx, false);
await phase("released", redeemed.tracker);

// Force a pending payout on the forks with an impossible minimum, then exercise the
// recipient's recovery through the real UI. No changes are made to the public deployment.
const fee = await env.base.readContract({ address: d.destinationGateway, abi: reachDestinationGatewayAbi, functionName: "messageFee" });
const burn = await baseWallet.writeContract({ address: d.destinationGateway, abi: reachDestinationGatewayAbi, functionName: "burnAndRedeem", args: [parseEther("0.5"), account, 2, maxUint256], value: fee, gas: 2_000_000n });
const receipt: TransactionReceipt = await env.base.waitForTransactionReceipt({ hash: burn });
if (receipt.status !== "success") throw new Error("Local pending burn failed");
let transferId: Hex | undefined;
for (const log of receipt.logs) {
  if (log.address.toLowerCase() !== d.destinationGateway.toLowerCase()) continue;
  try {
    const decoded = decodeEventLog({ abi: [reachEvents.receiptBurned], data: log.data, topics: log.topics });
    transferId = decoded.args.transferId;
  } catch { /* other event */ }
}
if (!transferId) throw new Error("Missing local burn event");
await deliver(burn, false);
await phase("pending", `/app/transfers/${transferId}?tx=${burn}&dir=REDEEM`);
console.log("PASS all five browser fork phases (LOCAL FORKS ONLY)");
