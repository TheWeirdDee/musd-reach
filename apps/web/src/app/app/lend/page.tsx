"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Amount, Button, Hash, Notice, Panel, Row, Skeleton } from "@/components/ui/primitives";
import { PageTitle, useGate, AmountField, useAmount, StepList, NetworkHint, type FlowStep } from "@/components/app/AppKit";
import { TransactionWorkspace, FlowIntro } from "@/components/app/Workspace";
import { MarketStrip, MarketsNotLive } from "@/components/app/Markets";
import { useContractTx } from "@/lib/tx";
import { BASE_ID, explorer } from "@/lib/reach";
import { cn } from "@/lib/cn";
import { markets, marketParams, vaultAbi, erc20Abi, useMarket, pct, USDC_DECIMALS } from "@/lib/markets";

export default function LendPage() {
  const { address, connected } = useGate();
  const qc = useQueryClient();
  const q = useMarket(address);
  const m = q.data;
  const pos = m?.position;
  const [mode, setMode] = useState<"deposit" | "withdraw">("deposit");
  const amount = useAmount(USDC_DECIMALS);
  const approve = useContractTx();
  const deposit = useContractTx();
  const withdraw = useContractTx();
  const busy = [approve, deposit, withdraw].some((t) => ["switching", "simulating", "signing", "pending"].includes(t.state.phase));

  if (!markets || !marketParams) return <><PageTitle kicker="Lend" title="Lend to Mezo savers on Base" /><MarketsNotLive /></>;
  if (!connected)
    return (
      <FlowIntro
        title="Lend USDC to Mezo savers."
        description="Deposit USDC into the Reach USDC Vault, a Morpho Vault V2 curated by Reach. It lends into the rwSMUSD market, where every loan is backed by savings locked on Mezo."
        requirements={["USDC on Base Sepolia (faucet.circle.com)", "Sepolia ETH for gas"]}
        steps={["Approve and deposit USDC into the vault.", "The vault supplies it to the rwSMUSD market on Morpho Blue.", "Borrowers pay interest; you earn it, minus Reach's 10% performance fee.", "Withdraw any time, up to available liquidity."]}
        docs="/docs/getting-started"
      />
    );

  const amt = amount.parsed ?? 0n;
  const withdrawable = pos && m ? (pos.vaultAssets < m.liquidity ? pos.vaultAssets : m.liquidity) : null;
  const refresh = () => qc.invalidateQueries({ queryKey: ["reach-market"] });

  async function doDeposit() {
    if (!pos || !markets || !marketParams || !address || amt === 0n) return;
    if (pos.usdcAllowanceVault < amt) {
      const r = await approve.run({ chainId: BASE_ID, address: marketParams.loanToken, abi: erc20Abi, functionName: "approve", args: [markets.vault, amt] });
      if (!r) return;
    }
    const r = await deposit.run({ chainId: BASE_ID, address: markets.vault, abi: vaultAbi, functionName: "deposit", args: [amt, address] });
    if (r) {
      amount.setValue("");
      refresh();
    }
  }

  async function doWithdraw() {
    if (!pos || !markets || !address || amt === 0n) return;
    const all = amt >= pos.vaultAssets;
    const r = all
      ? await withdraw.run({ chainId: BASE_ID, address: markets.vault, abi: vaultAbi, functionName: "redeem", args: [pos.vaultShares, address, address] })
      : await withdraw.run({ chainId: BASE_ID, address: markets.vault, abi: vaultAbi, functionName: "withdraw", args: [amt, address, address] });
    if (r) {
      amount.setValue("");
      refresh();
    }
  }

  const steps: FlowStep[] =
    mode === "deposit"
      ? [
          { key: "approve", title: "Approve USDC to the Reach vault", chain: "Base Sepolia", state: approve.state, done: approve.state.phase === "confirmed", skipped: !!pos && amt > 0n && pos.usdcAllowanceVault >= amt && approve.state.phase === "idle" },
          { key: "deposit", title: "Deposit; the vault supplies the rwSMUSD market", chain: "Base Sepolia", state: deposit.state, done: deposit.state.phase === "confirmed" },
        ]
      : [{ key: "withdraw", title: "Withdraw USDC from the vault", chain: "Base Sepolia", state: withdraw.state, done: withdraw.state.phase === "confirmed" }];
  const max = mode === "deposit" ? (pos ? pos.usdc : null) : withdrawable;
  const over = max !== null && amt > max;

  return (
    <>
      <PageTitle kicker="Lend" title={<>Lend to Mezo savers. <span className="font-serif italic text-ember-400">Backed by Mezo savings.</span></>}>
        The Reach USDC Vault is a Morpho Vault V2 that Reach curates. Deposits flow into the rwSMUSD market, so every borrower you fund has posted a claim on savings locked on Mezo, priced from a NAV that Mezo attests over Wormhole.
      </PageTitle>
      <div className="space-y-6">
        <Panel plain><MarketStrip m={m} /></Panel>
        <TransactionWorkspace>
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Deposit or withdraw">
              {(["deposit", "withdraw"] as const).map((t) => (
                <button key={t} role="tab" type="button" aria-selected={mode === t} disabled={busy} onClick={() => { setMode(t); amount.setValue(""); }} className={cn("h-11 rounded-sm border text-sm font-medium capitalize transition-colors", mode === t ? "border-ember-500 bg-ember-500/[0.06] text-bone-50" : "border-ink-600 text-ink-300 hover:border-ink-400")}>
                  {t}
                </button>
              ))}
            </div>
            <Panel plain className="space-y-6">
              <AmountField id="lend-amt" label={mode === "deposit" ? "USDC to deposit" : "USDC to withdraw"} unit="USDC" decimals={USDC_DECIMALS} value={amount.value} onChange={amount.setValue} max={max} disabled={busy} />
              <StepList steps={steps} />
              <Button className="w-full" size="lg" busy={busy} disabled={busy || !pos || amt === 0n || over} onClick={mode === "deposit" ? doDeposit : doWithdraw}>
                {!pos ? "Loading" : amt === 0n ? "Enter an amount" : over ? (mode === "deposit" ? "Insufficient USDC" : "Above available liquidity") : mode === "deposit" ? "Deposit USDC" : "Withdraw USDC"}
              </Button>
              {pos && pos.usdc === 0n && mode === "deposit" && (
                <Notice tone="info" title="Need test USDC?">
                  Claim free Base Sepolia USDC at <a className="underline underline-offset-4" href="https://faucet.circle.com" target="_blank" rel="noreferrer">faucet.circle.com</a>, then come back.
                </Notice>
              )}
              <NetworkHint chainId={BASE_ID} />
            </Panel>
          </div>
          <div className="space-y-6">
            <Panel plain>
              <h2 className="text-lg font-semibold tracking-[-0.02em] text-bone-50">Your deposit</h2>
              <dl className="mt-4">
                <Row label="Deposited value">{pos ? <Amount value={pos.vaultAssets} unit="USDC" decimals={USDC_DECIMALS} places={4} /> : <Skeleton className="h-4 w-24" />}</Row>
                <Row label="Vault shares">{pos ? <Amount value={pos.vaultShares} unit="reachUSDC" places={4} /> : "—"}</Row>
                <Row label="Net APR" hint="Market supply rate after Reach's fee">{pct(m?.vaultApr ?? null)}</Row>
                <Row label="Wallet USDC">{pos ? <Amount value={pos.usdc} unit="USDC" decimals={USDC_DECIMALS} places={2} /> : "—"}</Row>
              </dl>
            </Panel>
            <Panel plain>
              <h2 className="text-lg font-semibold tracking-[-0.02em] text-bone-50">How Reach earns</h2>
              <dl className="mt-4">
                <Row label="Performance fee" hint="On interest earned, never on principal">{m ? pct(m.performanceFee, 0) : "—"}</Row>
                <Row label="Fee recipient" hint="Reach treasury"><Hash value={markets.treasury} href={explorer.baseAddress(markets.treasury)} /></Row>
                <Row label="Vault TVL">{m ? <Amount value={m.vaultTotalAssets} unit="USDC" decimals={USDC_DECIMALS} places={2} /> : "—"}</Row>
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
