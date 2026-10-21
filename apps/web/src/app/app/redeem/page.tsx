"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { isAddress, type Address } from "viem";
import { reachDestinationGatewayAbi, reachSavingsWrapperAbi, RedeemMode, formatAmount } from "@musd-reach/sdk";
import { Amount, Button, Hash, Notice, Panel, Row } from "@/components/ui/primitives";
import { PageTitle, NotDeployedNotice, ConnectPrompt, useGate, AmountField, useAmount, StepList, NetworkHint } from "@/components/app/AppKit";
import { useClients, usePosition } from "@/lib/hooks";
import { useContractTx } from "@/lib/tx";
import { parseBurn } from "@/lib/events";
import { saveLocalTransfer } from "@/lib/pending";
import { reachConfig, explorer, BASE_ID } from "@/lib/reach";
import { cn } from "@/lib/cn";
import { settlementCopy } from "@/lib/settlement";

const SLIPPAGE_BPS = 50n;

export default function RedeemPage() {
  const { address, connected, deployed } = useGate();
  const d = reachConfig.deployment;
  const clients = useClients();
  const qc = useQueryClient();
  const router = useRouter();
  const pos = usePosition(address);
  const amount = useAmount();
  const [mode, setMode] = useState<number>(RedeemMode.SHARES);
  const [recipientInput, setRecipient] = useState<string | null>(null);
  // Defaults to the connected account until the user edits it.
  const recipient = recipientInput ?? address ?? "";
  const burn = useContractTx();


  const q = useQuery({
    queryKey: ["redeem-quote", amount.parsed?.toString(), mode],
    enabled: !!clients && !!d && !!amount.parsed,
    refetchInterval: 15_000,
    queryFn: async () => {
      const [musd, fee] = await Promise.all([
        clients!.mezo.readContract({ address: d!.wrapper, abi: reachSavingsWrapperAbi, functionName: "previewRedeem", args: [amount.parsed!] }),
        clients!.base.readContract({ address: d!.destinationGateway, abi: reachDestinationGatewayAbi, functionName: "messageFee" }),
      ]);
      return { musd, minAssets: (musd * (10_000n - SLIPPAGE_BPS)) / 10_000n, fee };
    },
  });
  const balance = pos.data ? pos.data.rwsmusd : null;
  const over = balance !== null && !!amount.parsed && amount.parsed > balance;
  const recipientOk = isAddress(recipient);
  const busy = ["switching", "simulating", "signing", "pending"].includes(burn.state.phase);

  async function submit() {
    if (!d || !amount.parsed || !q.data) return;
    const minAssets = mode === RedeemMode.MUSD ? q.data.minAssets : 0n;
    const receipt = await burn.run({ chainId: BASE_ID, address: d.destinationGateway, abi: reachDestinationGatewayAbi, functionName: "burnAndRedeem", args: [amount.parsed, recipient as Address, mode, minAssets], value: q.data.fee });
    if (!receipt) return;
    qc.invalidateQueries({ queryKey: ["position"] });
    const ev = parseBurn(receipt, d.destinationGateway);
    if (ev) {
      saveLocalTransfer({ transferId: ev.transferId, direction: "REDEEM", originTx: receipt.transactionHash, sequence: ev.sequence.toString(), shares: ev.shares.toString(), recipient: ev.recipient, account: address!, mode, createdAt: Date.now() });
      router.push(`/app/transfers/${ev.transferId}?tx=${receipt.transactionHash}&dir=REDEEM&seq=${ev.sequence}`);
    }
  }

  return (
    <>
      <PageTitle kicker="Redeem" title="Burn the receipt, bring the shares home">
        Burning rwSMUSD on Base publishes a return message. Once Base finalizes and guardians sign it (typically tens of minutes on testnet), it can be delivered on Mezo to release exactly the burned amount of wSMUSD.
      </PageTitle>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="space-y-6">
          {!deployed && <NotDeployedNotice />}
          <Panel className="space-y-6 p-6">
            <AmountField id="burn-amount" label="rwSMUSD to burn" unit="rwSMUSD" value={amount.value} onChange={amount.setValue} max={connected ? balance : undefined} disabled={!deployed} />
            <fieldset>
              <legend className="kicker mb-3 text-ink-300">Receive on Mezo</legend>
              <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">
                {[
                  { v: RedeemMode.SHARES, t: "wSMUSD shares", s: "Simplest exit. Exact shares, no dependency on vault liquidity." },
                  { v: RedeemMode.MUSD, t: "MUSD", s: settlementCopy.modeHint },
                ].map((o) => (
                  <button key={o.v} type="button" role="radio" aria-checked={mode === o.v} onClick={() => setMode(o.v)} className={cn("rounded-sm border px-4 py-3 text-left transition-colors", mode === o.v ? "border-ember-500 bg-ember-500/[0.06]" : "border-ink-600 hover:border-ink-400")}>
                    <span className="block font-medium text-bone-50">{o.t}</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-ink-300">{o.s}</span>
                  </button>
                ))}
              </div>
            </fieldset>
            <div>
              <label htmlFor="mezo-recipient" className="text-sm text-ink-300">
                Recipient on Mezo testnet
              </label>
              <input id="mezo-recipient" value={recipient} onChange={(e) => setRecipient(e.target.value.trim())} spellCheck={false} placeholder="0x…" aria-invalid={!recipientOk && recipient !== ""} className={cn("num mt-2 h-11 w-full rounded-sm border bg-ink-950 px-3 text-sm text-bone-100 outline-none focus:border-ember-500", recipientOk || !recipient ? "border-ink-600" : "border-rust-500")} />
            </div>
          </Panel>
          {!connected && <ConnectPrompt what="redeem receipts" />}
        </div>
        <div className="space-y-6">
          <Panel className="p-6">
            <h2 className="text-lg font-semibold tracking-[-0.02em] text-bone-50">Review before signing</h2>
            <dl className="mt-4">
              <Row label="Burn on">Base Sepolia (84532)</Row>
              <Row label="Release on">Mezo testnet (31611)</Row>
              <Row label="rwSMUSD burned">{amount.parsed ? <Amount value={amount.parsed} unit="rwSMUSD" places={6} /> : "—"}</Row>
              <Row label="wSMUSD released">{amount.parsed ? <Amount value={amount.parsed} unit="wSMUSD" places={6} /> : "—"}</Row>
              {mode === RedeemMode.MUSD && (
                <>
                  <Row label="MUSD at current NAV">{q.data ? <Amount value={q.data.musd} unit="MUSD" /> : "—"}</Row>
                  <Row label="Minimum MUSD" hint={settlementCopy.minHint}>{q.data ? <Amount value={q.data.minAssets} unit="MUSD" /> : "—"}</Row>
                </>
              )}
              <Row label="Fees">{q.data ? `No Reach fee · Wormhole ${formatAmount(q.data.fee, 18, 8)} ETH` : "—"}</Row>
              <Row label="Contract">{d ? <Hash value={d.destinationGateway} href={explorer.baseAddress(d.destinationGateway)} /> : "—"}</Row>
            </dl>
            <p className="mt-5 border-t border-ink-700 pt-5 text-xs leading-relaxed text-ink-300">
              The burn is final on Base immediately. Your shares stay reserved on Mezo until the return message is delivered; delivery can happen any time later, by you or anyone. MUSD redemption depends on live vault liquidity; the amount is computed at delivery, not now.
            </p>
          </Panel>
          <Panel className="space-y-4 p-6">
            <StepList steps={[{ key: "burn", title: "Burn rwSMUSD and publish REDEEM", chain: "Base Sepolia", state: burn.state, done: burn.state.phase === "confirmed" }]} />
            <Button className="w-full" size="lg" busy={busy} disabled={!deployed || !connected || !amount.parsed || over || !recipientOk || !q.data} onClick={submit}>
              {!deployed ? "Unavailable until deployment" : !connected ? "Connect a wallet" : !amount.parsed ? "Enter an amount" : over ? "Insufficient rwSMUSD" : "Burn and redeem"}
            </Button>
            <NetworkHint chainId={BASE_ID} />
            {q.isError && <Notice tone="failed">Could not quote: {(q.error as Error).message.split("\n")[0]}</Notice>}
          </Panel>
        </div>
      </div>
    </>
  );
}
