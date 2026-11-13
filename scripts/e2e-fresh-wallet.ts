/**
 * End-to-end run with a brand-new wallet, the way an outside tester would use Reach.
 *
 *   00  Fresh wallet: nothing on either chain
 *   01  Route kit from the app's own /api/route-kit (MUSD + gas on Mezo, gas on Base); no signature
 *   02  Mezo: approve MUSD; save it and send the receipt to Base in one transaction (depositAndIssue)
 *   03  Base: deliver the Wormhole-signed message; rwSMUSD minted
 *   04  Base: post part of the rwSMUSD as collateral in the Reach MUSD market
 *   05  Base: borrow MUSD against it
 *   06  Base: lend a little of it into the Reach MUSD Vault
 *   07  Base: repay part of the loan
 *   08  Mezo's bridge: send MUSD home Base → Mezo, deliver on Mezo
 *   09  Base: hand back the rest of the rwSMUSD (burnAndRedeem, MUSD payout)
 *   10  Mezo: deliver the signed return message; savings paid out as MUSD
 *   11  Route passport: every route stamp read back from chain events
 *
 * Every step is a real transaction checked against chain state. The wallet key lives only in the
 * project's git-ignored .env (REACH_TESTER_KEY); evidence goes to evidence/e2e/<run>.json.
 *
 *   pnpm --filter @musd-reach/scripts exec tsx e2e-fresh-wallet.ts [--kit-api=http://localhost:3000] [--save=20]
 *   ... --resume=evidence/e2e/<run>.json   continues a run from step 03 (e.g. after a Wormhole testnet signing delay)
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { join } from "node:path";
import { formatUnits, parseAbi, parseUnits, type Address, type Hex, type PublicClient, type TransactionReceipt, type WalletClient } from "viem";
import { reachDestinationGatewayAbi, reachSavingsWrapperAbi, reachSourceGatewayAbi } from "@musd-reach/sdk";
import { makeEnv, loadAccount, publishedFrom, obtainVaa, writeEvidence, ROOT } from "./lib/env.js";
import { bridgeMusd } from "./lib/ntt.js";

const flag = (name: string, fallback: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=") ?? fallback;
const erc20 = parseAbi(["function approve(address,uint256) returns (bool)", "function balanceOf(address) view returns (uint256)"]);
const morphoAbi = parseAbi([
  "function supplyCollateral((address,address,address,address,uint256) marketParams, uint256 assets, address onBehalf, bytes data)",
  "function borrow((address,address,address,address,uint256) marketParams, uint256 assets, uint256 shares, address onBehalf, address receiver) returns (uint256, uint256)",
  "function repay((address,address,address,address,uint256) marketParams, uint256 assets, uint256 shares, address onBehalf, bytes data) returns (uint256, uint256)",
  "function position(bytes32 id, address user) view returns (uint256 supplyShares, uint128 borrowShares, uint128 collateral)",
]);
const oracleAbi = parseAbi(["function price() view returns (uint256)"]);
const vaultAbi = parseAbi(["function deposit(uint256 assets, address onBehalf) returns (uint256)", "function balanceOf(address) view returns (uint256)"]);

type Step = { id: string; title: string; chain: "mezo" | "base" | "offchain"; status: "PASS" | "FAIL"; txHash?: Hex; explorer?: string; details: Record<string, unknown> };

async function main() {
  const env = makeEnv("testnet");
  const { cfg, mezo, base } = env;
  const d = cfg.deployment!;
  const m = JSON.parse(readFileSync(join(ROOT, "deployments", "testnet-markets-musd.json"), "utf8")) as Record<string, string>;
  const params = [m.loanToken, m.collateralToken, m.oracle, m.irm, BigInt(m.lltv!)] as const;
  const me = loadAccount("REACH_TESTER_KEY_FILE", "REACH_TESTER_KEY");
  const mw = env.mezoWallet(me);
  const bw = env.baseWallet(me);
  const kitApi = flag("kit-api", "http://localhost:3000");
  const save = parseUnits(flag("save", "20"), 18);
  const resumeFile = flag("resume", "");
  const resumed = resumeFile ? (JSON.parse(readFileSync(join(ROOT, resumeFile), "utf8")) as { runId: string; steps: Step[] }) : null;
  const runId = resumed?.runId ?? `e2e-fresh-wallet-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const steps: Step[] = resumed ? resumed.steps.filter((x) => Number(x.id) <= 2) : [];
  if (resumed && basename(resumeFile, ".json") !== runId) throw new Error("resume file and runId disagree");
  const mezoTx = (h: Hex) => `${cfg.mezo.explorer}/tx/${h}`;
  const baseTx = (h: Hex) => `${cfg.base.explorer}/tx/${h}`;
  const json = (v: unknown) => JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x));
  const record = (s: Step) => {
    steps.push(s);
    console.log(`${s.status} ${s.id} ${s.title}${s.txHash ? `  ${s.explorer}` : ""}`);
    writeEvidence(`evidence/e2e/${runId}.json`, { kind: "PUBLIC_TESTNET_E2E_FRESH_WALLET", runId, account: me.address, startedAt: runId.slice(17), steps });
    if (s.status !== "PASS") throw new Error(`step ${s.id} failed: ${json(s.details)}`);
  };
  async function send(client: PublicClient, wallet: WalletClient, req: Record<string, unknown>): Promise<TransactionReceipt> {
    const full = { ...req, account: me, chain: client.chain } as never;
    await client.simulateContract(full);
    const est = await client.estimateContractGas(full);
    const gas = client.chain!.id === 31611 ? (est * 2n > 1_500_000n ? est * 2n : 1_500_000n) : (est * 15n) / 10n + 50_000n;
    const hash = await wallet.writeContract({ ...(full as object), gas } as never);
    const r = await client.waitForTransactionReceipt({ hash, timeout: 300_000, retryCount: 20 });
    if (r.status !== "success") throw new Error(`reverted: ${hash}`);
    return r;
  }
  const bal = (c: PublicClient, token: Address, who: Address = me.address) => c.readContract({ address: token, abi: erc20, functionName: "balanceOf", args: [who] });
  const until = async <T>(read: () => Promise<T>, ok: (v: T) => boolean, label: string, ms = 180_000) => {
    const t0 = Date.now();
    for (;;) {
      const v = await read();
      if (ok(v)) return v;
      if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${label}`);
      await new Promise((r) => setTimeout(r, 5_000));
    }
  };

  let published;
  if (!resumed) {
  // 00 fresh wallet
  const [musd0, btc0, eth0] = await Promise.all([bal(mezo, cfg.mezo.musd), mezo.getBalance({ address: me.address }), base.getBalance({ address: me.address })]);
  record({ id: "00", title: "Fresh wallet: nothing on either chain", chain: "offchain", status: "PASS", details: { account: me.address, musd: musd0, mezoBtc: btc0, baseEth: eth0, fresh: musd0 === 0n && btc0 === 0n && eth0 === 0n } });

  // 01 route kit, sent by the relayer through the app's API
  const res = await fetch(`${kitApi}/api/route-kit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: me.address }) });
  const kit = (await res.json()) as { ok: boolean; mezo?: { status: string; hash?: Hex }; base?: { status: string; hash?: Hex } };
  const musd1 = await until(() => bal(mezo, cfg.mezo.musd), (v) => v >= save, "route kit MUSD");
  const eth1 = await until(() => base.getBalance({ address: me.address }), (v) => v > 0n, "route kit Base gas");
  record({ id: "01", title: "Route kit from /api/route-kit: MUSD + gas on Mezo, gas on Base, no signature", chain: "offchain", status: kit.ok ? "PASS" : "FAIL", txHash: kit.mezo?.hash, explorer: kit.mezo?.hash ? mezoTx(kit.mezo.hash) : undefined, details: { response: kit, musd: musd1, mezoBtc: await mezo.getBalance({ address: me.address }), baseEth: eth1, baseTx: kit.base?.hash ? baseTx(kit.base.hash) : null } });

  // 02 Mezo: save and send to Base in one transaction
  await send(mezo, mw, { address: cfg.mezo.musd, abi: erc20, functionName: "approve", args: [d.sourceGateway, save] });
  const quote = await mezo.readContract({ address: d.wrapper, abi: reachSavingsWrapperAbi, functionName: "previewDeposit", args: [save] });
  const fee = await mezo.readContract({ address: d.sourceGateway, abi: reachSourceGatewayAbi, functionName: "messageFee" });
  const issue = await send(mezo, mw, { address: d.sourceGateway, abi: reachSourceGatewayAbi, functionName: "depositAndIssue", args: [save, me.address, (quote * 995n) / 1000n], value: fee });
  published = await publishedFrom(mezo, issue, cfg.mezo.wormholeCore);
  record({ id: "02", title: "Mezo: save MUSD and send the receipt to Base (depositAndIssue)", chain: "mezo", status: "PASS", txHash: issue.transactionHash, explorer: mezoTx(issue.transactionHash), details: { musd: save, quotedShares: quote, wormholeSequence: published.sequence } });

  } else {
    const issueTx = resumed.steps.find((x) => x.id === "02")?.txHash;
    if (!issueTx) throw new Error("resume file has no step 02");
    published = await publishedFrom(mezo, await mezo.waitForTransactionReceipt({ hash: issueTx, timeout: 300_000, retryCount: 20 }), cfg.mezo.wormholeCore);
    console.log(`resuming ${runId} from step 03 (ISSUE sequence ${published.sequence})`);
  }

  // 03 Base: deliver ISSUE
  const { vaa } = await obtainVaa(env, cfg.mezo.wormholeChainId, published);
  const deliver = await send(base, bw, { address: d.destinationGateway, abi: reachDestinationGatewayAbi, functionName: "receiveIssue", args: [vaa] });
  const rw = await bal(base, m.collateralToken as Address);
  record({ id: "03", title: "Base: deliver the Wormhole-signed message; rwSMUSD minted", chain: "base", status: rw > 0n ? "PASS" : "FAIL", txHash: deliver.transactionHash, explorer: baseTx(deliver.transactionHash), details: { rwSMUSD: rw } });

  // 04 collateral: three quarters of the receipt; the rest comes home in step 09
  const col = (rw * 3n) / 4n;
  await send(base, bw, { address: m.collateralToken, abi: erc20, functionName: "approve", args: [m.morpho, col] });
  const sc = await send(base, bw, { address: m.morpho, abi: morphoAbi, functionName: "supplyCollateral", args: [params, col, me.address, "0x"] });
  record({ id: "04", title: "Base: post rwSMUSD as collateral in the Reach MUSD market", chain: "base", status: "PASS", txHash: sc.transactionHash, explorer: baseTx(sc.transactionHash), details: { collateral: col } });

  // 05 borrow half of the allowed amount
  const price = await base.readContract({ address: m.oracle as Address, abi: oracleAbi, functionName: "price" });
  const maxBorrow = (((col * price) / 10n ** 36n) * BigInt(m.lltv!)) / 10n ** 18n;
  const borrowAmt = maxBorrow / 2n;
  const musdB0 = await bal(base, m.loanToken as Address);
  const br = await send(base, bw, { address: m.morpho, abi: morphoAbi, functionName: "borrow", args: [params, borrowAmt, 0n, me.address, me.address] });
  const got = (await bal(base, m.loanToken as Address)) - musdB0;
  record({ id: "05", title: "Base: borrow MUSD against the savings receipt", chain: "base", status: got === borrowAmt ? "PASS" : "FAIL", txHash: br.transactionHash, explorer: baseTx(br.transactionHash), details: { borrowed: borrowAmt, maxAtOpening: maxBorrow, oraclePrice: price } });

  // 06 lend a tenth of it into the Reach MUSD Vault
  const lend = borrowAmt / 10n;
  await send(base, bw, { address: m.loanToken, abi: erc20, functionName: "approve", args: [m.vault, lend] });
  const dep = await send(base, bw, { address: m.vault, abi: vaultAbi, functionName: "deposit", args: [lend, me.address] });
  const shares = await base.readContract({ address: m.vault as Address, abi: vaultAbi, functionName: "balanceOf", args: [me.address] });
  record({ id: "06", title: "Base: lend MUSD into the Reach MUSD Vault", chain: "base", status: shares > 0n ? "PASS" : "FAIL", txHash: dep.transactionHash, explorer: baseTx(dep.transactionHash), details: { lent: lend, vaultShares: shares } });

  // 07 repay half of the loan
  const repayAmt = borrowAmt / 2n;
  await send(base, bw, { address: m.loanToken, abi: erc20, functionName: "approve", args: [m.morpho, repayAmt] });
  const rp = await send(base, bw, { address: m.morpho, abi: morphoAbi, functionName: "repay", args: [params, repayAmt, 0n, me.address, "0x"] });
  record({ id: "07", title: "Base: repay part of the loan", chain: "base", status: "PASS", txHash: rp.transactionHash, explorer: baseTx(rp.transactionHash), details: { repaid: repayAmt } });

  // 08 bridge the remaining MUSD home on Mezo's own bridge
  // NTT carries 8 decimals: round down so the amount has no dust.
  const held = await bal(base, m.loanToken as Address);
  const home = held - (held % 10n ** 10n);
  const musdMezoBefore = await bal(mezo, cfg.mezo.musd);
  const ntt = await bridgeMusd(env, (c, req) => send(c, c.chain!.id === 31611 ? mw : bw, req), "base", home, me.address, me.address);
  const arrived = (await bal(mezo, cfg.mezo.musd)) - musdMezoBefore;
  record({ id: "08", title: "Mezo's bridge: MUSD sent home Base → Mezo and delivered", chain: "mezo", status: arrived === home ? "PASS" : "FAIL", txHash: ntt.deliver.transactionHash, explorer: mezoTx(ntt.deliver.transactionHash), details: { amount: home, baseTransfer: baseTx(ntt.transfer.transactionHash), sequence: ntt.sequence } });

  // 09 hand back the rest of the receipt on Base, MUSD payout on Mezo
  const rest = await bal(base, m.collateralToken as Address);
  const bfee = await base.readContract({ address: d.destinationGateway, abi: reachDestinationGatewayAbi, functionName: "messageFee" });
  const burn = await send(base, bw, { address: d.destinationGateway, abi: reachDestinationGatewayAbi, functionName: "burnAndRedeem", args: [rest, me.address, 2, 0n], value: bfee });
  const back = await publishedFrom(base, burn, cfg.base.wormholeCore);
  record({ id: "09", title: "Base: hand back rwSMUSD to bring the savings home (burnAndRedeem)", chain: "base", status: "PASS", txHash: burn.transactionHash, explorer: baseTx(burn.transactionHash), details: { rwSMUSD: rest, wormholeSequence: back.sequence } });

  // 10 Mezo: deliver the return message
  const { vaa: rvaa } = await obtainVaa(env, cfg.base.wormholeChainId, back);
  const musdBeforeHome = await bal(mezo, cfg.mezo.musd);
  const redeem = await send(mezo, mw, { address: d.sourceGateway, abi: reachSourceGatewayAbi, functionName: "receiveRedeem", args: [rvaa] });
  const paid = (await bal(mezo, cfg.mezo.musd)) - musdBeforeHome;
  record({ id: "10", title: "Mezo: deliver the return message; savings paid out as MUSD", chain: "mezo", status: paid > 0n ? "PASS" : "FAIL", txHash: redeem.transactionHash, explorer: mezoTx(redeem.transactionHash), details: { musdPaid: paid, musd: formatUnits(paid, 18) } });

  // 11 route passport, from the same explorer events the app reads (they index within a minute or two)
  const passport = await until(
    async () => {
      const r = await fetch(`${kitApi}/passport/${me.address}`);
      return r.ok ? await r.text() : "";
    },
    (html) => /8 of 8 route stamps|full route/i.test(html),
    "route passport to show the full route",
    600_000,
  ).catch(() => "");
  record({ id: "11", title: "Route passport: the full route stamped, read back from chain events", chain: "offchain", status: passport ? "PASS" : "FAIL", details: { page: `${kitApi}/passport/${me.address}` } });
  console.log(`\nALL PASS · evidence/e2e/${runId}.json`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
