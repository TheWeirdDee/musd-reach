"use client";

import Link from "next/link";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Amount, Button, Hash, Notice, Panel, Row, Skeleton } from "@/components/ui/primitives";
import { PageTitle, useGate, AmountField, useAmount, StepList, NetworkHint, type FlowStep } from "@/components/app/AppKit";
import { TransactionWorkspace, FlowIntro } from "@/components/app/Workspace";
import { MarketStrip, MarketsNotLive, AssetSwitch, useLoanAsset, MarketsPreview } from "@/components/app/Markets";
import { useContractTx } from "@/lib/tx";
import { SuccessCard, type Success } from "@/components/app/SuccessCard";
import { formatAmount } from "@musd-reach/sdk";
import { BASE_ID, explorer } from "@/lib/reach";
import { cn } from "@/lib/cn";
import { marketDef, vaultAbi, erc20Abi, useMarket, pct } from "@/lib/markets";

export default function LendPage() {
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
  const [mode, setMode] = useState<"deposit" | "withdraw">("deposit");
  const amount = useAmount(DEC);
  const approve = useContractTx();
  const deposit = useContractTx();
  const [done, setDone] = useState<Success | null>(null);
  const withdraw = useContractTx();
  const busy = [approve, deposit, withdraw].some((t) => ["switching", "simulating", "signing", "pending"].includes(t.state.phase));

  if (!def || !markets || !marketParams) return <><PageTitle kicker="Lend" title="Lend to Mezo savers on Base" /><MarketsNotLive /></>;
  if (!connected)
    return (
      <>
      <FlowIntro
        title="Lend MUSD or USDC to Mezo savers."
        description="Deposit MUSD into the Reach MUSD Vault, or USDC into the Reach USDC Vault: Morpho Vault V2s curated by Reach. Each lends into an rwSMUSD market, where every loan is backed by savings locked on Mezo."
        requirements={["USDC (faucet.circle.com) or MUSD on Base (from the route kit, bridged)", "Base Sepolia ETH for gas: the free route kit on the Try it page includes it"]}
        steps={["Approve and deposit MUSD or USDC into its vault.", "The vault supplies it to the rwSMUSD market on Morpho Blue.", "Borrowers pay interest; you earn it, minus Reach's 10% performance fee.", "Withdraw any time, up to available liquidity."]}
        docs="/docs/getting-started"
      />
      <MarketsPreview className="mt-10" />
      </>
    );

  const amt = amount.parsed ?? 0n;
  const withdrawable = pos && m ? (pos.vaultAssets < m.liquidity ? pos.vaultAssets : m.liquidity) : null;
  const refresh = () => qc.invalidateQueries({ queryKey: ["reach-market"] });

  async function doDeposit() {
    if (!pos || !markets || !marketParams || !address || amt === 0n) return;
    if (pos.loanAllowanceVault < amt) {
      const r = await approve.run({ chainId: BASE_ID, address: marketParams.loanToken, abi: erc20Abi, functionName: "approve", args: [markets.vault, amt] });
      if (!r) return;
    }
    const lent = formatAmount(amt, DEC, 2);
    const r = await deposit.run({ chainId: BASE_ID, address: markets.vault, abi: vaultAbi, functionName: "deposit", args: [amt, address] }, { success: `You're lending ${lent} ${SYM}` });
    if (r) {
      amount.setValue("");
      refresh();
      setDone({
        title: `You're lending ${lent} ${SYM}.`,
        body: `It earns ${m ? pct(m.vaultApr) : "the vault rate"} a year now, paid by borrowers whose loans are backed by Mezo savings. Withdraw any time, up to what is not lent out.`,
        href: explorer.baseTx(r.transactionHash),
        next: [{ href: "/app", label: "See your position" }],
      });
    }
  }

  async function doWithdraw() {
    if (!pos || !markets || !address || amt === 0n) return;
    const all = amt >= pos.vaultAssets;
    const r = all
      ? await withdraw.run({ chainId: BASE_ID, address: markets.vault, abi: vaultAbi, functionName: "redeem", args: [pos.vaultShares, address, address] })
      : await withdraw.run({ chainId: BASE_ID, address: markets.vault, abi: vaultAbi, functionName: "withdraw", args: [amt, address, address] });
    if (r) {
      setDone({ title: `${formatAmount(all ? pos.vaultAssets : amt, DEC, 2)} ${SYM} is back in your wallet.`, body: "Including the interest it earned while lent.", href: explorer.baseTx(r.transactionHash) });
      amount.setValue("");
      refresh();
    }
  }

  const steps: FlowStep[] =
    mode === "deposit"
      ? [
          { key: "approve", title: `Approve ${SYM} to the ${def?.vaultName ?? "Reach vault"}`, chain: "Base Sepolia", state: approve.state, done: approve.state.phase === "confirmed", skipped: !!pos && amt > 0n && pos.loanAllowanceVault >= amt && approve.state.phase === "idle" },
          { key: "deposit", title: "Deposit; the vault supplies the rwSMUSD market", chain: "Base Sepolia", state: deposit.state, done: deposit.state.phase === "confirmed" },
        ]
      : [{ key: "withdraw", title: `Withdraw ${SYM} from the vault`, chain: "Base Sepolia", state: withdraw.state, done: withdraw.state.phase === "confirmed" }];
  const max = mode === "deposit" ? (pos ? pos.loan : null) : withdrawable;
  const over = max !== null && amt > max;

  return (
    <>
      <PageTitle kicker="Lend" title={<>Lend to Mezo savers. <span className="font-serif italic text-ember-400">Backed by Mezo savings.</span></>}>
        The Reach MUSD and USDC Vaults are Morpho Vault V2s that Reach curates. Deposits flow into the rwSMUSD markets, so every borrower you fund has posted a claim on savings locked on Mezo, priced from a NAV that Mezo attests over Wormhole.
      </PageTitle>
      <div className="space-y-6">
        <Panel plain><MarketStrip m={m} def={def} /></Panel>
        <TransactionWorkspace>
          <div className="space-y-6">
            {done && <SuccessCard s={done} onClose={() => setDone(null)} />}
            <AssetSwitch asset={asset} onChange={(a) => { setAsset(a); amount.setValue(""); }} disabled={busy} verb="Lend" />
            <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Deposit or withdraw">
              {(["deposit", "withdraw"] as const).map((t) => (
                <button key={t} role="tab" type="button" aria-selected={mode === t} disabled={busy} onClick={() => { setMode(t); amount.setValue(""); }} className={cn("h-11 rounded-sm border text-sm font-medium capitalize transition-colors", mode === t ? "border-ember-500 bg-ember-500/[0.06] text-bone-50" : "border-ink-600 text-ink-300 hover:border-ink-400")}>
                  {t}
                </button>
              ))}
            </div>
            <Panel plain className="space-y-6">
              <AmountField id="lend-amt" label={mode === "deposit" ? `${SYM} to deposit` : `${SYM} to withdraw`} unit={SYM} decimals={DEC} value={amount.value} onChange={amount.setValue} max={max} disabled={busy} />
              <StepList steps={steps} />
              <Button className="w-full" size="lg" busy={busy} disabled={busy || !pos || amt === 0n || over} onClick={mode === "deposit" ? doDeposit : doWithdraw}>
                {!pos ? "Loading" : amt === 0n ? "Enter an amount" : over ? (mode === "deposit" ? `Insufficient ${SYM}` : "Above available liquidity") : mode === "deposit" ? `Deposit ${SYM}` : `Withdraw ${SYM}`}
              </Button>
              {pos && pos.loan === 0n && mode === "deposit" && asset === "USDC" && (
                <Notice tone="info" title="Need test USDC?">
                  Claim free Base Sepolia USDC at <a className="underline underline-offset-4" href="https://faucet.circle.com" target="_blank" rel="noreferrer">faucet.circle.com</a>, then come back.
                </Notice>
              )}
              {pos && pos.loan === 0n && mode === "deposit" && asset === "MUSD" && (
                <Notice tone="info" title="Need MUSD on Base?">
                  Claim the free <Link className="underline underline-offset-4" href="/start">route kit</Link> on Mezo, then <Link className="underline underline-offset-4" href="/app/bridge">bridge it to Base</Link> over Mezo&apos;s own bridge.
                </Notice>
              )}
              <NetworkHint chainId={BASE_ID} />
            </Panel>
          </div>
          <div className="space-y-6">
            <Panel plain>
              <h2 className="text-lg font-semibold tracking-[-0.02em] text-bone-50">Your deposit</h2>
              <dl className="mt-4">
                <Row label="Deposited value">{pos ? <Amount value={pos.vaultAssets} unit={SYM} decimals={DEC} places={4} /> : <Skeleton className="h-4 w-24" />}</Row>
                <Row label="Vault shares">{pos ? <Amount value={pos.vaultShares} unit={def.vaultSymbol} places={4} /> : "—"}</Row>
                <Row label="Net APR" hint="Market supply rate after Reach's fee">{pct(m?.vaultApr ?? null)}</Row>
                <Row label={`Wallet ${SYM}`}>{pos ? <Amount value={pos.loan} unit={SYM} decimals={DEC} places={2} /> : "—"}</Row>
              </dl>
            </Panel>
            <Panel plain>
              <h2 className="text-lg font-semibold tracking-[-0.02em] text-bone-50">How Reach earns</h2>
              <dl className="mt-4">
                <Row label="Performance fee" hint="On interest earned, never on principal">{m ? pct(m.performanceFee, 0) : "—"}</Row>
                <Row label="Fee recipient" hint="Reach treasury"><Hash value={markets.treasury} href={explorer.baseAddress(markets.treasury)} /></Row>
                <Row label="Vault TVL">{m ? <Amount value={m.vaultTotalAssets} unit={SYM} decimals={DEC} places={2} /> : "—"}</Row>
                <Row label="Vault"><Hash value={markets.vault} href={explorer.baseAddress(markets.vault)} /></Row>
              </dl>
              <p className="mt-5 border-t border-ink-700 pt-5 text-xs leading-relaxed text-ink-300">
                Reach takes 10% of the interest borrowers pay into this vault. Bridging savings and redeeming them back to Mezo stay free, so the fee is paid only when the portable claim is put to work.
              </p>
            </Panel>
          </div>
        </TransactionWorkspace>
      </div>
    </>
  );
}
