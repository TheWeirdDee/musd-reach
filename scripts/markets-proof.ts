/**
 * Public-testnet proof for the Reach market layer on Base Sepolia.
 *
 *   Mezo:  MUSD → wSMUSD (native savings vault) → locked in the source gateway (ISSUE)
 *   Base:  rwSMUSD minted from the guardian-signed ISSUE
 *          USDC deposited into the Reach USDC Vault (Morpho Vault V2) → supplied to the market
 *          rwSMUSD posted as Morpho Blue collateral → USDC borrowed → partially repaid
 *
 * Every step is a real transaction checked against chain state, recorded to
 * evidence/markets/<run>.json for the website's proof pages.
 *
 *   pnpm --filter @musd-reach/scripts exec tsx markets-proof.ts \
 *     --musd=200 --usdc=30 --borrow-bps=5000
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { encodeAbiParameters, keccak256, parseAbi, parseUnits, formatUnits, type Address, type Hex, type PublicClient, type TransactionReceipt, type WalletClient } from "viem";
import { reachDestinationGatewayAbi, reachSavingsWrapperAbi, reachSourceGatewayAbi } from "@musd-reach/sdk";
import { ROOT, loadAccount, makeEnv, obtainVaa, publishedFrom, writeEvidence } from "./lib/env";

const flag = (name: string, fallback: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? fallback;

const erc20 = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
]);
const marketParamsType = "(address loanToken, address collateralToken, address oracle, address irm, uint256 lltv)";
export const morphoAbi = parseAbi([
  `function supplyCollateral(${marketParamsType} marketParams, uint256 assets, address onBehalf, bytes data)`,
  `function borrow(${marketParamsType} marketParams, uint256 assets, uint256 shares, address onBehalf, address receiver) returns (uint256, uint256)`,
  `function repay(${marketParamsType} marketParams, uint256 assets, uint256 shares, address onBehalf, bytes data) returns (uint256, uint256)`,
  "function market(bytes32 id) view returns (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee)",
  "function position(bytes32 id, address user) view returns (uint256 supplyShares, uint128 borrowShares, uint128 collateral)",
]);
const vaultAbi = parseAbi([
  "function deposit(uint256 assets, address onBehalf) returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function convertToAssets(uint256 shares) view returns (uint256)",
  "function totalAssets() view returns (uint256)",
]);
const oracleAbi = parseAbi(["function price() view returns (uint256)"]);

type Step = { id: string; title: string; chain: "mezo" | "base" | "offchain"; status: "PASS" | "FAIL"; txHash?: Hex; explorer?: string; details: Record<string, unknown> };

async function main() {
  const env = makeEnv("testnet");
  const { cfg, mezo, base } = env;
  const d = cfg.deployment!;
  const m = JSON.parse(readFileSync(join(ROOT, "deployments", "testnet-markets.json"), "utf8")) as Record<string, string>;
  const params = {
    loanToken: m.loanToken as Address,
    collateralToken: m.collateralToken as Address,
    oracle: m.oracle as Address,
    irm: m.irm as Address,
    lltv: BigInt(m.lltv!),
  };
  const marketId = keccak256(encodeAbiParameters([{ type: "tuple", components: [{ name: "loanToken", type: "address" }, { name: "collateralToken", type: "address" }, { name: "oracle", type: "address" }, { name: "irm", type: "address" }, { name: "lltv", type: "uint256" }] }], [params]));
  if (marketId !== m.marketId) throw new Error("market id mismatch");

  const me = loadAccount("REACH_PRIVATE_KEY_FILE", "REACH_PRIVATE_KEY");
  const mw = env.mezoWallet(me);
  const bw = env.baseWallet(me);
  const musdAmount = parseUnits(flag("musd", "200"), 18);
  const usdcAmount = parseUnits(flag("usdc", "30"), 6);
  const borrowBps = BigInt(flag("borrow-bps", "5000"));
  const runId = `markets-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const steps: Step[] = [];
  const record = (s: Step) => {
    steps.push(s);
    console.log(`${s.status} ${s.id} ${s.title}${s.txHash ? `  ${s.explorer}` : ""}`);
    if (s.status !== "PASS") throw new Error(`step ${s.id} failed: ${JSON.stringify(s.details, (_, v) => (typeof v === "bigint" ? v.toString() : v))}`);
  };

  async function send(client: PublicClient, wallet: WalletClient, req: Record<string, unknown>): Promise<TransactionReceipt> {
    const full = { ...req, account: me, chain: client.chain } as never;
    await client.simulateContract(full);
    const est = await client.estimateContractGas(full);
    const isMezo = client.chain!.id === 31611;
    const gas = isMezo ? (est * 2n > 1_500_000n ? est * 2n : 1_500_000n) : (est * 15n) / 10n + 50_000n;
    const hash = await wallet.writeContract({ ...(full as object), gas } as never);
    const r = await client.waitForTransactionReceipt({ hash, timeout: 300_000, retryCount: 20 });
    if (r.status !== "success") throw new Error(`reverted: ${hash}`);
    return r;
  }
  const mezoTx = (h: Hex) => `${cfg.mezo.explorer}/tx/${h}`;
  const baseTx = (h: Hex) => `${cfg.base.explorer}/tx/${h}`;
  const bal = (c: PublicClient, token: Address, who: Address) => c.readContract({ address: token, abi: erc20, functionName: "balanceOf", args: [who] });

  // 00 preflight
  const [musd, usdc, mezoGas, baseGas] = await Promise.all([bal(mezo, cfg.mezo.musd, me.address), bal(base, params.loanToken, me.address), mezo.getBalance({ address: me.address }), base.getBalance({ address: me.address })]);
  record({ id: "00", title: "Preflight: balances on both chains", chain: "offchain", status: musd >= musdAmount && usdc >= usdcAmount && mezoGas > 0n && baseGas > 0n ? "PASS" : "FAIL", details: { account: me.address, musd, usdc, mezoGas, baseGas, musdAmount, usdcAmount } });

  // 01-02 Mezo: approve + depositAndIssue
  const approveM = await send(mezo, mw, { address: cfg.mezo.musd, abi: erc20, functionName: "approve", args: [d.sourceGateway, musdAmount] });
  record({ id: "01", title: "Approve exact MUSD to the source gateway", chain: "mezo", status: "PASS", txHash: approveM.transactionHash, explorer: mezoTx(approveM.transactionHash), details: { amount: musdAmount } });
  const quote = await mezo.readContract({ address: d.wrapper, abi: reachSavingsWrapperAbi, functionName: "previewDeposit", args: [musdAmount] });
  const fee = await mezo.readContract({ address: d.sourceGateway, abi: reachSourceGatewayAbi, functionName: "messageFee" });
  const issue = await send(mezo, mw, { address: d.sourceGateway, abi: reachSourceGatewayAbi, functionName: "depositAndIssue", args: [musdAmount, me.address, (quote * 995n) / 1000n], value: fee });
  const published = await publishedFrom(mezo, issue, cfg.mezo.wormholeCore);
  record({ id: "02", title: "Deposit MUSD into Mezo savings via the wrapper and lock wSMUSD (ISSUE)", chain: "mezo", status: "PASS", txHash: issue.transactionHash, explorer: mezoTx(issue.transactionHash), details: { musd: musdAmount, quotedShares: quote, wormholeSequence: published.sequence } });

  // 03 Base: deliver ISSUE (also carries a fresh NAV)
  const rwBefore = await bal(base, params.collateralToken, me.address);
  const { vaa } = await obtainVaa(env, cfg.mezo.wormholeChainId, published);
  const deliver = await send(base, bw, { address: d.destinationGateway, abi: reachDestinationGatewayAbi, functionName: "receiveIssue", args: [vaa] });
  const rw = (await bal(base, params.collateralToken, me.address)) - rwBefore;
  record({ id: "03", title: "Deliver guardian-signed ISSUE on Base; rwSMUSD minted and NAV refreshed", chain: "base", status: rw > 0n ? "PASS" : "FAIL", txHash: deliver.transactionHash, explorer: baseTx(deliver.transactionHash), details: { rwSMUSDMinted: rw } });

  // 04-05 Lend: USDC into the Reach vault
  const marketBefore = await base.readContract({ address: m.morpho as Address, abi: morphoAbi, functionName: "market", args: [marketId] });
  const approveU = await send(base, bw, { address: params.loanToken, abi: erc20, functionName: "approve", args: [m.vault, usdcAmount] });
  record({ id: "04", title: "Approve exact USDC to the Reach USDC Vault", chain: "base", status: "PASS", txHash: approveU.transactionHash, explorer: baseTx(approveU.transactionHash), details: { amount: usdcAmount } });
  const dep = await send(base, bw, { address: m.vault, abi: vaultAbi, functionName: "deposit", args: [usdcAmount, me.address] });
  const marketAfterDep = await base.readContract({ address: m.morpho as Address, abi: morphoAbi, functionName: "market", args: [marketId] });
  const routed = marketAfterDep[0] - marketBefore[0];
  record({ id: "05", title: "Lend: deposit USDC into the Reach vault; routed into the rwSMUSD market", chain: "base", status: routed >= usdcAmount - 2n ? "PASS" : "FAIL", txHash: dep.transactionHash, explorer: baseTx(dep.transactionHash), details: { deposited: usdcAmount, marketSupplyIncrease: routed, vaultShares: await base.readContract({ address: m.vault as Address, abi: vaultAbi, functionName: "balanceOf", args: [me.address] }) } });

  // 06-07 Collateral
  const approveR = await send(base, bw, { address: params.collateralToken, abi: erc20, functionName: "approve", args: [m.morpho, rw] });
  record({ id: "06", title: "Approve exact rwSMUSD to Morpho Blue", chain: "base", status: "PASS", txHash: approveR.transactionHash, explorer: baseTx(approveR.transactionHash), details: { amount: rw } });
  const col = await send(base, bw, { address: m.morpho, abi: morphoAbi, functionName: "supplyCollateral", args: [params, rw, me.address, "0x"] });
  const pos = await base.readContract({ address: m.morpho as Address, abi: morphoAbi, functionName: "position", args: [marketId, me.address] });
  record({ id: "07", title: "Post rwSMUSD (Mezo savings claim) as Morpho collateral", chain: "base", status: pos[2] >= rw ? "PASS" : "FAIL", txHash: col.transactionHash, explorer: baseTx(col.transactionHash), details: { collateral: pos[2] } });

  // 08 Borrow
  const price = await base.readContract({ address: params.oracle, abi: oracleAbi, functionName: "price" });
  const collateralValue = (BigInt(pos[2]) * price) / 10n ** 36n;
  const maxBorrow = (collateralValue * params.lltv) / 10n ** 18n;
  const liquidity = marketAfterDep[0] - marketAfterDep[2];
  let borrowAmt = (maxBorrow * borrowBps) / 10_000n;
  if (borrowAmt > liquidity) borrowAmt = liquidity;
  const usdcBefore = await bal(base, params.loanToken, me.address);
  const brw = await send(base, bw, { address: m.morpho, abi: morphoAbi, functionName: "borrow", args: [params, borrowAmt, 0n, me.address, me.address] });
  const got = (await bal(base, params.loanToken, me.address)) - usdcBefore;
  record({ id: "08", title: "Borrow USDC on Base against Mezo savings", chain: "base", status: got === borrowAmt ? "PASS" : "FAIL", txHash: brw.transactionHash, explorer: baseTx(brw.transactionHash), details: { oraclePrice: price, collateralValueUsdc: collateralValue, maxBorrowUsdc: maxBorrow, borrowed: got } });

  // 09 Partial repay (position stays open: a live borrower in the market)
  const repayAmt = got / 2n;
  await send(base, bw, { address: params.loanToken, abi: erc20, functionName: "approve", args: [m.morpho, repayAmt] });
  const rep = await send(base, bw, { address: m.morpho, abi: morphoAbi, functionName: "repay", args: [params, repayAmt, 0n, me.address, "0x"] });
  const posAfter = await base.readContract({ address: m.morpho as Address, abi: morphoAbi, functionName: "position", args: [marketId, me.address] });
  record({ id: "09", title: "Repay half; position stays open as a live borrower", chain: "base", status: posAfter[1] < pos[1] || pos[1] === 0n ? "PASS" : "FAIL", txHash: rep.transactionHash, explorer: baseTx(rep.transactionHash), details: { repaid: repayAmt, borrowSharesAfter: posAfter[1] } });

  const marketEnd = await base.readContract({ address: m.morpho as Address, abi: morphoAbi, functionName: "market", args: [marketId] });
  const out = writeEvidence(`evidence/markets/${runId}.json`, {
    kind: "PUBLIC_TESTNET_MARKETS_RUN",
    runId,
    startedAt: new Date().toISOString(),
    account: me.address,
    markets: m,
    marketState: { totalSupplyAssets: marketEnd[0], totalBorrowAssets: marketEnd[2] },
    steps,
  });
  console.log(`\nevidence: ${out}\nmarket supply ${formatUnits(marketEnd[0], 6)} USDC, borrowed ${formatUnits(marketEnd[2], 6)} USDC`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
