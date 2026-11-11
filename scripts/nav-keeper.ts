/**
 * NAV keeper: keeps the rwSMUSD price on Base fresh for the Morpho market.
 *
 *   1. Read the destination gateway's latest authenticated NAV snapshot (Base Sepolia).
 *   2. If it is older than --max-age-hours (default 20h; the oracle accepts 72h), call the
 *      permissionless `publishNav()` on the Mezo source gateway.
 *   3. Wait for the Wormhole guardians to sign the NAV message.
 *   4. Deliver it with the permissionless `receiveNav()` on Base.
 *
 * Holds no authority: any funded account can run it, and a forged or replayed snapshot is
 * rejected by the gateway. Used by .github/workflows/keeper.yml on a daily schedule.
 *
 *   pnpm --filter @musd-reach/scripts exec tsx nav-keeper.ts [--force]   (keys come from the project .env)
 */
import { formatUnits } from "viem";
import { reachDestinationGatewayAbi, reachSourceGatewayAbi } from "@musd-reach/sdk";
import { loadAccount, makeEnv, obtainVaa, publishedFrom, writeEvidence } from "./lib/env";

const args = process.argv.slice(2);
const force = args.includes("--force");
const maxAgeArg = args.find((a) => a.startsWith("--max-age-hours="));
const maxAgeHours = maxAgeArg ? Number(maxAgeArg.split("=")[1]) : 20;

async function main() {
  const env = makeEnv("testnet");
  const { cfg, mezo, base } = env;
  const d = cfg.deployment;
  if (!d) throw new Error("No deployment recorded in deployments/testnet.json");

  const [hasNav, nav, head] = await Promise.all([
    base.readContract({ address: d.destinationGateway, abi: reachDestinationGatewayAbi, functionName: "hasNav" }),
    base.readContract({ address: d.destinationGateway, abi: reachDestinationGatewayAbi, functionName: "latestNav" }),
    base.getBlock(),
  ]);
  const [assets, supply, timestamp] = nav as readonly [bigint, bigint, bigint, bigint, bigint];
  const ageHours = hasNav ? Number(head.timestamp - timestamp) / 3600 : Infinity;
  const navPerShare = supply > 0n ? formatUnits((assets * 10n ** 18n) / supply, 18) : "n/a";
  console.log(`Base NAV: ${hasNav ? `${navPerShare} MUSD/share, ${ageHours.toFixed(1)}h old` : "none"}`);
  if (!force && ageHours < maxAgeHours) {
    console.log(`Fresh enough (< ${maxAgeHours}h). Nothing to do.`);
    return;
  }

  // Prefer the dedicated gas-only keeper key; fall back to the operator key.
  const keeper = process.env.REACH_KEEPER_KEY
    ? loadAccount("REACH_KEEPER_KEY_FILE", "REACH_KEEPER_KEY")
    : loadAccount("REACH_PRIVATE_KEY_FILE", "REACH_PRIVATE_KEY");
  const mw = env.mezoWallet(keeper);
  const bw = env.baseWallet(keeper);

  const fee = await mezo.readContract({ address: d.sourceGateway, abi: reachSourceGatewayAbi, functionName: "messageFee" });
  const publishReq = {
    address: d.sourceGateway,
    abi: reachSourceGatewayAbi,
    functionName: "publishNav",
    value: fee,
    account: keeper,
    chain: cfg.mezo.chain,
  } as const;
  await mezo.simulateContract(publishReq);
  const est = await mezo.estimateContractGas(publishReq);
  // Mezo's estimate omits the EIP-7623 calldata floor; gas there is near-free, so pad generously.
  const gas = est * 2n > 600_000n ? est * 2n : 600_000n;
  const publishHash = await mw.writeContract({ ...publishReq, gas });
  console.log(`publishNav (Mezo): ${cfg.mezo.explorer}/tx/${publishHash}`);
  const publishReceipt = await mezo.waitForTransactionReceipt({ hash: publishHash, timeout: 300_000, retryCount: 20 });
  if (publishReceipt.status !== "success") throw new Error("publishNav reverted");

  const msg = await publishedFrom(mezo, publishReceipt, cfg.mezo.wormholeCore);
  console.log(`Wormhole sequence ${msg.sequence}; waiting for guardian signatures (Mezo finality)…`);
  const { vaa } = await obtainVaa(env, cfg.mezo.wormholeChainId, msg);

  const deliverReq = {
    address: d.destinationGateway,
    abi: reachDestinationGatewayAbi,
    functionName: "receiveNav",
    args: [vaa],
    account: keeper,
    chain: cfg.base.chain,
  } as const;
  await base.simulateContract(deliverReq);
  const deliverGas = ((await base.estimateContractGas(deliverReq)) * 15n) / 10n;
  const deliverHash = await bw.writeContract({ ...deliverReq, gas: deliverGas });
  console.log(`receiveNav (Base): ${cfg.base.explorer}/tx/${deliverHash}`);
  const deliverReceipt = await base.waitForTransactionReceipt({ hash: deliverHash, timeout: 300_000 });
  if (deliverReceipt.status !== "success") throw new Error("receiveNav reverted");

  const after = (await base.readContract({ address: d.destinationGateway, abi: reachDestinationGatewayAbi, functionName: "latestNav" })) as readonly [bigint, bigint, bigint, bigint, bigint];
  console.log(`NAV refreshed: ${formatUnits((after[0] * 10n ** 18n) / (after[1] || 1n), 18)} MUSD/share at Mezo block ${after[3]}`);
  if (args.includes("--record")) {
    const p = writeEvidence(`evidence/markets/nav-${new Date().toISOString().replace(/[:.]/g, "-")}.json`, {
      kind: "NAV_REFRESH",
      publishTx: publishHash,
      wormholeSequence: msg.sequence,
      deliverTx: deliverHash,
      nav: { assets: after[0], supply: after[1], timestamp: after[2], mezoBlock: after[3], sourceNonce: after[4] },
    });
    console.log(`evidence: ${p}`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
