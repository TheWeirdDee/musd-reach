"use client";

import Link from "next/link";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { maxUint256 } from "viem";
import { Amount, Button, Chip, Hash, Notice, Panel, Row, Skeleton } from "@/components/ui/primitives";
import { PageTitle, useGate, AmountField, useAmount, StepList, NetworkHint, type FlowStep } from "@/components/app/AppKit";
import { TransactionWorkspace, FlowIntro } from "@/components/app/Workspace";
import { useContractTx } from "@/lib/tx";
import { BASE_ID, explorer } from "@/lib/reach";
import { cn } from "@/lib/cn";
import { marketDef, morphoAbi, erc20Abi, useMarket, WAD, pct } from "@/lib/markets";
import { MarketStrip, MarketsNotLive, AssetSwitch, useLoanAsset, MarketsPreview } from "@/components/app/Markets";
import { WorthItCalculator } from "@/components/app/WorthItCalculator";
import { SuccessCard, type Success } from "@/components/app/SuccessCard";
import { formatAmount } from "@musd-reach/sdk";

const ORACLE_SCALE = 10n ** 36n;

export default function BorrowPage() {
  const { address, connected } = useGate();
  const qc = useQueryClient();
  const [asset, setAsset] = useLoanAsset();
  const def = marketDef(asset);
  const markets = def?.cfg;
  const marketParams = def?.params;
  const DEC = def?.decimals ?? 6;
  const SYM = asset;
  const q = useMarket(address, asset);
  const m = q.data;
  const pos = m?.position;
  const [mode, setMode] = useState<"borrow" | "repay">("borrow");
  const [done, setDone] = useState<Success | null>(null);

  const collateralIn = useAmount();
  const borrowIn = useAmount(DEC);
  const repayIn = useAmount(DEC);
  const withdrawIn = useAmount();
  const approveCol = useContractTx();
  const supplyCol = useContractTx();
  const borrowTx = useContractTx();
  const approveRepay = useContractTx();
  const repayTx = useContractTx();
  const withdrawTx = useContractTx();
  const busy = [approveCol, supplyCol, borrowTx, approveRepay, repayTx, withdrawTx].some((t) => ["switching", "simulating", "signing", "pending"].includes(t.state.phase));

  if (!def || !markets || !marketParams) return <><PageTitle kicker="Borrow" title="Borrow against your Mezo savings" /><MarketsNotLive /></>;
  if (!connected)
    return (
      <>
      <FlowIntro
        title="Borrow on Base. Keep earning on Mezo."
        description="Post rwSMUSD, your portable claim on Mezo savings, as collateral in a Morpho Blue market and borrow MUSD or USDC on Base. The savings position never leaves Mezo's vault."
        requirements={["rwSMUSD on Base Sepolia (make savings portable first)", "Sepolia ETH for gas", "A fresh Mezo NAV snapshot (kept current by the keeper)"]}
        steps={["Approve and post rwSMUSD as Morpho collateral.", "Borrow MUSD (Mezo's own stablecoin) or USDC up to the market's max LTV.", "Repay any time, then withdraw your rwSMUSD.", "Burn rwSMUSD to bring the savings home to Mezo."]}
        docs="/docs/getting-started"
      />
      <MarketsPreview className="mt-10" />
      <WorthItCalculator className="mt-10" />
      </>
    );

  const price = m?.price ?? null;
  const addCol = collateralIn.parsed ?? 0n;
  const addDebt = borrowIn.parsed ?? 0n;
  const repayAmt = repayIn.parsed ?? 0n;
  const wdCol = withdrawIn.parsed ?? 0n;

  const projCollateral = pos ? (mode === "borrow" ? pos.collateral + addCol : pos.collateral - (wdCol > pos.collateral ? pos.collateral : wdCol)) : 0n;
  const projDebt = pos ? (mode === "borrow" ? pos.borrowed + addDebt : pos.borrowed - (repayAmt > pos.borrowed ? pos.borrowed : repayAmt)) : 0n;
  const projMax = price === null ? null : (((projCollateral * price) / ORACLE_SCALE) * (m?.lltv ?? 0n)) / WAD;
  const projHealth = projMax === null || projDebt === 0n ? null : Number((projMax * 10_000n) / projDebt) / 10_000;
  const borrowCapacity = pos && projMax !== null ? (projMax > pos.borrowed ? projMax - pos.borrowed : 0n) : null;
  const maxBorrowable = borrowCapacity === null || !m ? null : borrowCapacity < m.liquidity ? borrowCapacity : m.liquidity;
  const overBorrow = maxBorrowable !== null && addDebt > maxBorrowable;
  const unsafe = projHealth !== null && projHealth < 1;

  const refresh = () => qc.invalidateQueries({ queryKey: ["reach-market"] });

  async function doBorrow() {
    if (!pos || !marketParams || !markets || !address) return;
    if (addCol > 0n) {
      if (pos.rwAllowanceMorpho < addCol) {
        const r = await approveCol.run({ chainId: BASE_ID, address: marketParams.collateralToken, abi: erc20Abi, functionName: "approve", args: [markets.morpho, addCol] });
        if (!r) return;
      }
      const r = await supplyCol.run({ chainId: BASE_ID, address: markets.morpho, abi: morphoAbi, functionName: "supplyCollateral", args: [marketParams, addCol, address, "0x"] }, { success: `${formatAmount(addCol, 18, 4)} rwSMUSD posted as collateral` });
      if (!r) return;
      if (addDebt === 0n) setDone({ title: `${formatAmount(addCol, 18, 4)} rwSMUSD is now collateral.`, body: "Your savings keep earning on Mezo. Borrow against it whenever you like.", href: explorer.baseTx(r.transactionHash) });
    }
    if (addDebt > 0n) {
      const got = formatAmount(addDebt, DEC, 2);
      const r = await borrowTx.run({ chainId: BASE_ID, address: markets.morpho, abi: morphoAbi, functionName: "borrow", args: [marketParams, addDebt, 0n, address, address] }, { success: `${got} ${SYM} borrowed, now in your wallet` });
      if (!r) return;
      setDone({
        title: `${got} ${SYM} is in your wallet.`,
        body: `Your savings keep earning on Mezo while you use it. Interest accrues at ${m ? pct(m.borrowApr) : "the market rate"} a year; repay any time.`,
        href: explorer.baseTx(r.transactionHash),
        next: SYM === "MUSD" ? [{ href: "/app/bridge", label: "Take it home to Mezo and save it" }, { href: "/app", label: "See your position" }] : [{ href: "/app", label: "See your position" }],
      });
    }
    collateralIn.setValue("");
    borrowIn.setValue("");
    refresh();
  }

  async function doRepay() {
    if (!pos || !marketParams || !markets || !address) return;
    const repayAll = repayAmt > 0n && repayAmt >= pos.borrowed;
    if (repayAmt > 0n) {
      const need = repayAll ? pos.borrowed + 10n : repayAmt;
      if (pos.loanAllowanceMorpho < need) {
        const r = await approveRepay.run({ chainId: BASE_ID, address: marketParams.loanToken, abi: erc20Abi, functionName: "approve", args: [markets.morpho, repayAll ? maxUint256 : repayAmt] });
        if (!r) return;
      }
      const r = await repayTx.run({ chainId: BASE_ID, address: markets.morpho, abi: morphoAbi, functionName: "repay", args: repayAll ? [marketParams, 0n, pos.borrowShares, address, "0x"] : [marketParams, repayAmt, 0n, address, "0x"] }, { success: repayAll ? "Loan repaid in full" : `${formatAmount(repayAmt, DEC, 2)} ${SYM} repaid` });
      if (!r) return;
      if (wdCol === 0n) setDone({ title: repayAll ? "Your loan is fully repaid." : `${formatAmount(repayAmt, DEC, 2)} ${SYM} repaid.`, body: repayAll ? "Withdraw your rwSMUSD collateral, then bring your savings home whenever you like." : "Your loan is smaller now, and your savings keep earning on Mezo.", href: explorer.baseTx(r.transactionHash) });
    }
    if (wdCol > 0n) {
      const r = await withdrawTx.run({ chainId: BASE_ID, address: markets.morpho, abi: morphoAbi, functionName: "withdrawCollateral", args: [marketParams, wdCol, address, address] }, { success: `${formatAmount(wdCol, 18, 4)} rwSMUSD back in your wallet` });
      if (!r) return;
      setDone({ title: `${formatAmount(wdCol, 18, 4)} rwSMUSD is back in your wallet.`, body: "Bring your savings home to Mezo whenever you like, with everything they earned.", href: explorer.baseTx(r.transactionHash), next: [{ href: "/app/redeem", label: "Bring savings home" }] });
    }
    repayIn.setValue("");
    withdrawIn.setValue("");
    refresh();
  }

  const borrowSteps: FlowStep[] = [
    { key: "approve", title: "Approve rwSMUSD to Morpho Blue", chain: "Base Sepolia", state: approveCol.state, done: approveCol.state.phase === "confirmed", skipped: addCol === 0n || (!!pos && pos.rwAllowanceMorpho >= addCol && approveCol.state.phase === "idle") },
    { key: "collateral", title: "Post rwSMUSD as collateral", chain: "Base Sepolia", state: supplyCol.state, done: supplyCol.state.phase === "confirmed", skipped: addCol === 0n },
    { key: "borrow", title: `Borrow ${SYM} to your wallet`, chain: "Base Sepolia", state: borrowTx.state, done: borrowTx.state.phase === "confirmed", skipped: addDebt === 0n },
  ];
  const repaySteps: FlowStep[] = [
    { key: "approve", title: `Approve ${SYM} to Morpho Blue`, chain: "Base Sepolia", state: approveRepay.state, done: approveRepay.state.phase === "confirmed", skipped: repayAmt === 0n || (!!pos && pos.loanAllowanceMorpho >= repayAmt && approveRepay.state.phase === "idle") },
    { key: "repay", title: `Repay ${SYM} debt`, chain: "Base Sepolia", state: repayTx.state, done: repayTx.state.phase === "confirmed", skipped: repayAmt === 0n },
    { key: "withdraw", title: "Withdraw rwSMUSD collateral", chain: "Base Sepolia", state: withdrawTx.state, done: withdrawTx.state.phase === "confirmed", skipped: wdCol === 0n },
  ];

  const borrowDisabled = busy || !pos || (addCol === 0n && addDebt === 0n) || addCol > (pos?.rwsmusd ?? 0n) || overBorrow || unsafe || (addDebt > 0n && !m?.navFresh);
  const repayDisabled = busy || !pos || (repayAmt === 0n && wdCol === 0n) || repayAmt > (pos?.loan ?? 0n) || wdCol > (pos?.collateral ?? 0n) || unsafe;

  return (
    <>
      <PageTitle kicker="Borrow" title={<>Borrow on Base. <span className="font-serif italic text-ember-400">Keep earning on Mezo.</span></>}>
        rwSMUSD is a claim on wSMUSD locked on Mezo, priced from the savings NAV that Mezo attests over Wormhole. Post it in a Morpho Blue market and borrow MUSD, Mezo&apos;s own stablecoin, or USDC; the underlying savings keep accruing in Mezo&apos;s vault the whole time.
      </PageTitle>
      <div className="space-y-6">
        <Panel plain>
          <MarketStrip m={m} def={def} />
          {m && !m.navFresh && <Notice className="mt-4" tone="pending" title="NAV refresh pending">New borrows pause until a fresh savings NAV arrives from Mezo (the keeper publishes one every 12 hours). Repaying is always open.</Notice>}
        </Panel>
        <TransactionWorkspace>
          <div className="space-y-6">
            {done && <SuccessCard s={done} onClose={() => setDone(null)} />}
            <AssetSwitch asset={asset} onChange={(a) => { setAsset(a); borrowIn.setValue(""); repayIn.setValue(""); }} disabled={busy} verb="Borrow" />
            <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Borrow or repay">
              {(["borrow", "repay"] as const).map((t) => (
                <button key={t} role="tab" type="button" aria-selected={mode === t} disabled={busy} onClick={() => setMode(t)} className={cn("h-11 rounded-sm border text-sm font-medium transition-colors", mode === t ? "border-ember-500 bg-ember-500/[0.06] text-bone-50" : "border-ink-600 text-ink-300 hover:border-ink-400")}>
                  {t === "borrow" ? "Add collateral & borrow" : "Repay & withdraw"}
                </button>
              ))}
            </div>
            {mode === "borrow" ? (
              <Panel plain className="space-y-6">
                <AmountField id="col-in" label="rwSMUSD to post as collateral" unit="rwSMUSD" value={collateralIn.value} onChange={collateralIn.setValue} max={pos ? pos.rwsmusd : null} disabled={busy} />
                <AmountField id="borrow-in" label={`${SYM} to borrow`} unit={SYM} decimals={DEC} value={borrowIn.value} onChange={borrowIn.setValue} max={maxBorrowable} disabled={busy} />
                {addDebt > 0n && m && m.borrowApr !== null && (() => {
                  // What this loan means in plain numbers, at the market rate right now.
                  const now = Number(addDebt) / 10 ** DEC;
                  const apr = m.borrowApr ?? 0;
                  const interest30 = (now * apr * 30) / 365;
                  const drop = projHealth !== null && projHealth > 1 ? 1 - 1 / projHealth : null;
                  return (
                    <dl className="rounded-sm border border-ink-700 bg-ink-950/60 px-4 py-1">
                      <Row label="You receive now">{now.toLocaleString("en-US", { maximumFractionDigits: 2 })} {SYM}</Row>
                      <Row label="You owe after 30 days" hint={`at today's ${pct(m.borrowApr)} a year; the rate moves with demand`}>{(now + interest30).toLocaleString("en-US", { maximumFractionDigits: 2 })} {SYM}</Row>
                      <Row label="Safety margin" hint="how far your savings value could fall before liquidation">{drop === null ? "—" : `${(drop * 100).toFixed(1)}%`}</Row>
                      <Row label="Your savings">Keep earning on Mezo the whole time</Row>
                    </dl>
                  );
                })()}
                <StepList steps={borrowSteps} />
                <Button className="w-full" size="lg" busy={busy} disabled={borrowDisabled} onClick={doBorrow}>
                  {!pos ? "Loading position" : addCol === 0n && addDebt === 0n ? "Enter an amount" : addCol > pos.rwsmusd ? "Insufficient rwSMUSD" : overBorrow || unsafe ? "Above max LTV" : addDebt > 0n && !m?.navFresh ? "Waiting for fresh NAV" : addDebt > 0n ? `Borrow ${SYM}` : "Post collateral"}
                </Button>
                {asset === "MUSD" && pos && pos.loan > 0n && <Notice tone="info" title="Take your MUSD home">Borrowed MUSD is Mezo&apos;s canonical MUSD. <Link className="underline underline-offset-4" href="/app/bridge">Bridge it to Mezo</Link> over Mezo&apos;s own bridge and save it again, or use it anywhere on Base.</Notice>}
                {pos && pos.rwsmusd === 0n && pos.collateral === 0n && <Notice tone="info" title="No rwSMUSD yet">Make some savings portable first: <Link className="underline underline-offset-4" href="/app/portable/new">Mezo savings → rwSMUSD on Base</Link>.</Notice>}
              </Panel>
            ) : (
              <Panel plain className="space-y-6">
                <AmountField id="repay-in" label={`${SYM} to repay`} unit={SYM} decimals={DEC} value={repayIn.value} onChange={repayIn.setValue} max={pos ? (pos.loan < pos.borrowed ? pos.loan : pos.borrowed) : null} disabled={busy} />
                <AmountField id="wd-in" label="rwSMUSD collateral to withdraw" unit="rwSMUSD" value={withdrawIn.value} onChange={withdrawIn.setValue} max={pos ? pos.collateral : null} disabled={busy} />
                <StepList steps={repaySteps} />
                <Button className="w-full" size="lg" busy={busy} disabled={repayDisabled} onClick={doRepay}>
                  {!pos ? "Loading position" : repayAmt === 0n && wdCol === 0n ? "Enter an amount" : repayAmt > pos.loan ? `Insufficient ${SYM}` : unsafe ? "Repay more before withdrawing" : "Repay and withdraw"}
                </Button>
              </Panel>
            )}
            <NetworkHint chainId={BASE_ID} />
          </div>
          <div className="space-y-6">
            <Panel plain>
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold tracking-[-0.02em] text-bone-50">Your position</h2>
                {projHealth !== null && <Chip tone={projHealth < 1.1 ? "failed" : projHealth < 1.4 ? "pending" : "verified"}>Health {projHealth.toFixed(2)}</Chip>}
              </div>
              <dl className="mt-4">
                <Row label="Collateral" hint="rwSMUSD posted in Morpho">{pos ? <Amount value={pos.collateral} unit="rwSMUSD" /> : <Skeleton className="h-4 w-24" />}</Row>
                <Row label="Collateral value" hint="NAV after haircut">{pos?.collateralValue != null ? <Amount value={pos.collateralValue} unit={SYM} decimals={DEC} places={2} /> : "—"}</Row>
                <Row label="Debt">{pos ? <Amount value={pos.borrowed} unit={SYM} decimals={DEC} places={4} /> : <Skeleton className="h-4 w-24" />}</Row>
                <Row label="After this action" hint="Projected debt / borrow limit">{projMax !== null ? <><Amount value={projDebt} unit="" decimals={DEC} places={2} /> / <Amount value={projMax} unit={SYM} decimals={DEC} places={2} /></> : "—"}</Row>
                <Row label="Wallet">{pos ? <><Amount value={pos.rwsmusd} unit="rwSMUSD" places={2} /> · <Amount value={pos.loan} unit={SYM} decimals={DEC} places={2} /></> : "—"}</Row>
              </dl>
              <p className="mt-5 border-t border-ink-700 pt-5 text-xs leading-relaxed text-ink-300">
                Health below 1.00 allows liquidation: a liquidator repays part of the debt and receives rwSMUSD, which they can redeem on Mezo for the underlying savings. The savings themselves never leave Mezo&apos;s vault.
              </p>
            </Panel>
            <Panel plain>
              <h2 className="text-lg font-semibold tracking-[-0.02em] text-bone-50">Market</h2>
              <dl className="mt-4">
                <Row label="Venue">Morpho Blue · Base Sepolia</Row>
                <Row label="Market id"><Hash value={markets.marketId} href={markets.createMarketTx ? explorer.baseTx(markets.createMarketTx) : explorer.baseAddress(markets.morpho)} /></Row>
                <Row label="Oracle" hint="ReachNavOracle: Wormhole-attested NAV">{<Hash value={markets.oracle} href={explorer.baseAddress(markets.oracle)} />}</Row>
                <Row label="Collateral">{<Hash value={marketParams.collateralToken} href={explorer.baseAddress(marketParams.collateralToken)} />}</Row>
                <Row label="Total supplied">{m ? <Amount value={m.totalSupply} unit={SYM} decimals={DEC} places={2} /> : "—"}</Row>
                <Row label="Total borrowed">{m ? <Amount value={m.totalBorrow} unit={SYM} decimals={DEC} places={2} /> : "—"}</Row>
              </dl>
            </Panel>
          </div>
        </TransactionWorkspace>
        <WorthItCalculator />
      </div>
    </>
  );
}
