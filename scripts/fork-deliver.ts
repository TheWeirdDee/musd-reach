/**
 * LOCAL FORK ONLY. Delivers the message published by `--tx` using a locally overridden guardian
 * key, standing in for the Wormhole guardians (who do not observe local forks). Refuses to run
 * unless both RPCs are local Anvil forks.
 *
 *   REACH_DEPLOYMENTS=<fork deployments json> REACH_PRIVATE_KEY_FILE=<key> \
 *     npx tsx fork-deliver.ts --tx 0x… --dir ISSUE|REDEEM
 */
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import type { Hex } from "viem";
import { reachDestinationGatewayAbi, reachSourceGatewayAbi } from "@musd-reach/sdk";
import { makeEnv, loadAccount, overrideForkGuardian, publishedFrom, obtainVaa } from "./lib/env.js";

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const tx = arg("tx") as Hex | undefined;
  const dir = arg("dir");
  if (!tx || (dir !== "ISSUE" && dir !== "REDEEM")) throw new Error("usage: --tx <hash> --dir ISSUE|REDEEM");
  const guardianKey = (process.env.REACH_FORK_GUARDIAN_KEY as Hex | undefined) ?? generatePrivateKey();
  process.env.REACH_FORK_GUARDIAN_KEY = guardianKey;
  const env = makeEnv("fork");
  for (const c of [env.mezo, env.base]) {
    const v = await c.request({ method: "web3_clientVersion" as never });
    if (!String(v).toLowerCase().includes("anvil")) throw new Error(`refusing: ${String(v)} is not a local Anvil fork`);
  }
  const d = env.cfg.deployment!;
  const g = privateKeyToAccount(guardianKey).address;
  await overrideForkGuardian(env.mezo, env.cfg.mezo.wormholeCore, g);
  await overrideForkGuardian(env.base, env.cfg.base.wormholeCore, g);
  const account = loadAccount("REACH_PRIVATE_KEY_FILE", "REACH_PRIVATE_KEY");
  const issue = dir === "ISSUE";
  const origin = issue ? env.mezo : env.base;
  const receipt = await origin.getTransactionReceipt({ hash: tx });
  const msg = await publishedFrom(origin, receipt, issue ? env.cfg.mezo.wormholeCore : env.cfg.base.wormholeCore);
  const { vaa } = await obtainVaa(env, issue ? env.cfg.mezo.wormholeChainId : env.cfg.base.wormholeChainId, msg);
  const wallet = issue ? env.baseWallet(account) : env.mezoWallet(account);
  const target = issue ? env.base : env.mezo;
  const hash = issue
    ? await wallet.writeContract({ address: d.destinationGateway, abi: reachDestinationGatewayAbi, functionName: "receiveIssue", args: [vaa], chain: env.cfg.base.chain, account, gas: 2_000_000n })
    : await wallet.writeContract({ address: d.sourceGateway, abi: reachSourceGatewayAbi, functionName: "receiveRedeem", args: [vaa], chain: env.cfg.mezo.chain, account, gas: 3_000_000n });
  const r = await target.waitForTransactionReceipt({ hash });
  console.log(`delivered ${dir} ${tx} -> ${hash} status ${r.status}`);
  if (r.status !== "success") process.exitCode = 1;
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exitCode = 1;
});
