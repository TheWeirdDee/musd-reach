"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { erc20Abi, isAddress, type Address } from "viem";
import { reachSourceGatewayAbi, reachSavingsWrapperAbi, formatAmount } from "@musd-reach/sdk";
import { Amount, Button, Hash, Notice, Panel, Row } from "@/components/ui/primitives";
import { PageTitle, NotDeployedNotice, useGate, AmountField, useAmount, StepList, NetworkHint } from "@/components/app/AppKit";
import { useClients, usePosition } from "@/lib/hooks";
import { useContractTx } from "@/lib/tx";
import { parseLock } from "@/lib/events";
import { saveLocalTransfer } from "@/lib/pending";
import { reachConfig, explorer, MEZO_ID } from "@/lib/reach";
import { cn } from "@/lib/cn";
import { TransactionWorkspace, FlowIntro } from "@/components/app/Workspace";
import { useTransactionCost } from "@/lib/transactionCost";
import { TransactionReadiness, readinessLabel } from "@/components/app/TransactionReadiness";

type Source = "MUSD" | "wSMUSD";
/** Accept up to 0.5% fewer shares than quoted if the share price moves before the deposit lands. */
const SLIPPAGE_BPS = 50n;

export default function MakePortablePage() {
  const { address, chainId, connected, deployed } = useGate();
  const d = reachConfig.deployment;
  const clients = useClients();
  const qc = useQueryClient();
  const router = useRouter();
  const pos = usePosition(address);
  const amount = useAmount();
  // MUSD is the one-step path: save it on Mezo and send the receipt to Base in one transaction.
  const [src, setSrc] = useState<Source>("MUSD");
  const [recipientInput, setRecipient] = useState<string | null>(null);
  // Defaults to the connected account until the user edits it.
  const recipient = recipientInput ?? address ?? "";
  const approve = useContractTx();
  const lock = useContractTx();
  const token = src === "MUSD" ? reachConfig.mezo.musd : d?.wrapper;

  const info = useQuery({
    queryKey: ["lock-info", src, address, amount.parsed?.toString()],
    enabled: !!clients && !!d && !!address && !!token,
    refetchInterval: 15_000,
    queryFn: async () => {
      const m = clients!.mezo;
      const [allowance, fee, paused, shares, value] = await Promise.all([
        m.readContract({ address: token!, abi: erc20Abi, functionName: "allowance", args: [address!, d!.sourceGateway] }),
        m.readContract({ address: d!.sourceGateway, abi: reachSourceGatewayAbi, functionName: "messageFee" }),
        m.readContract({ address: d!.sourceGateway, abi: reachSourceGatewayAbi, functionName: "issuancePaused" }),
        // Shares (and so rwSMUSD) this amount becomes: a quote for MUSD, exact for wSMUSD.
        !amount.parsed ? Promise.resolve(null) : src === "MUSD" ? m.readContract({ address: d!.wrapper, abi: reachSavingsWrapperAbi, functionName: "previewDeposit", args: [amount.parsed] }) : Promise.resolve(amount.parsed),
        !amount.parsed ? Promise.resolve(null) : src === "MUSD" ? Promise.resolve(amount.parsed) : m.readContract({ address: d!.wrapper, abi: reachSavingsWrapperAbi, functionName: "convertToAssets", args: [amount.parsed] }),
      ]);
      return { allowance, fee, paused, shares, value };
    },
  });
  const i = info.data;
  const needsApproval = !!i && !!amount.parsed && i.allowance < amount.parsed;
  const balance = pos.data ? (src === "MUSD" ? pos.data.musd : pos.data.wsmusd) : null;
  const over = balance !== null && !!amount.parsed && amount.parsed > balance;
  const recipientOk = isAddress(recipient) && !/^0x0{40}$/i.test(recipient);
  const busy = [approve.state.phase, lock.state.phase].some((p) => ["switching", "simulating", "signing", "pending"].includes(p));
  const minShares = i?.shares ? (i.shares * (10_000n - SLIPPAGE_BPS)) / 10_000n : 0n;
  const sendCall = !d || !amount.parsed || !i
    ? null
    : src === "MUSD"
      ? ({ chainId: MEZO_ID, address: d.sourceGateway, abi: reachSourceGatewayAbi, functionName: "depositAndIssue", args: [amount.parsed, recipient as Address, minShares], value: i.fee } as const)
      : ({ chainId: MEZO_ID, address: d.sourceGateway, abi: reachSourceGatewayAbi, functionName: "lockAndIssue", args: [amount.parsed, recipient as Address], value: i.fee } as const);
  const cost = useTransactionCost(i && amount.parsed && address && recipientOk && token && sendCall ? (needsApproval ? { chainId: MEZO_ID, address: token, abi: erc20Abi, functionName: "approve", args: [d!.sourceGateway, amount.parsed] } : sendCall) : null);

  async function submit() {
    if (!d || !amount.parsed || !i || !token || !sendCall) return;
    if (needsApproval) {
      const r = await approve.run({ chainId: MEZO_ID, address: token, abi: erc20Abi, functionName: "approve", args: [d.sourceGateway, amount.parsed] });
      if (!r) return;
    }
    const receipt = await lock.run(sendCall);
    if (!receipt) return;
    qc.invalidateQueries({ queryKey: ["position"] });
    const ev = parseLock(receipt, d.sourceGateway);
    if (ev) {
      saveLocalTransfer({ transferId: ev.transferId, direction: "ISSUE", originTx: receipt.transactionHash, sequence: ev.sequence.toString(), shares: ev.shares.toString(), recipient: ev.recipient, account: address!, createdAt: Date.now() });
      router.push(`/app/transfers/${ev.transferId}?tx=${receipt.transactionHash}&dir=ISSUE&seq=${ev.sequence}`);
    }
  }

  if (!connected)
    return (
      <FlowIntro
        title="Move your savings to Base"
        description="Save MUSD in Mezo's Savings Vault and get rwSMUSD on Base in one step. rwSMUSD is your savings receipt: it keeps earning on Mezo, and on Base you can borrow against it."
        requirements={["MUSD and gas on both chains: the free route kit on the Try it page has all of it"]}
        steps={["Approve MUSD, once.", "Save it on Mezo and send the receipt to Base, in one transaction.", "Wormhole confirms the message (usually a few minutes on testnet).", "Collect rwSMUSD on Base from the tracker, then borrow against it."]}
        docs="/docs/first-transfer"
      />
    );

  const unit = src;
  return (
    <>
      <PageTitle kicker="Make portable" title="Move your savings to Base">
        Your MUSD is saved in Mezo&apos;s own Savings Vault and keeps earning there. You receive the same value as rwSMUSD on Base: a savings receipt you can borrow against or lend, and bring home at any time.
      </PageTitle>
      <TransactionWorkspace>
        <div className="space-y-6">
          {!deployed && <NotDeployedNotice />}
          <Panel plain className="space-y-6">
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="What to send">
              {(["MUSD", "wSMUSD"] as const).map((s) => (
                <button key={s} type="button" role="radio" aria-checked={src === s} disabled={busy} onClick={() => { setSrc(s); amount.setValue(""); }} className={cn("rounded-sm border px-3 py-2.5 text-left transition-colors", src === s ? "border-ember-500 bg-ember-500/[0.06]" : "border-ink-600 hover:border-ink-400")}>
                  <span className="block text-sm font-medium text-bone-50">{s === "MUSD" ? "MUSD" : "Already saved (wSMUSD)"}</span>
                  <span className="mt-0.5 block text-xs text-ink-400">{s === "MUSD" ? "Save and send in one step" : "Send savings you wrapped earlier"}</span>
                </button>
              ))}
            </div>
            <AmountField id="lock-amount" label={src === "MUSD" ? "MUSD to save and send" : "wSMUSD to send"} unit={unit} value={amount.value} onChange={amount.setValue} max={connected ? balance : undefined} disabled={!deployed || busy} />
            {src === "MUSD" && pos.data && pos.data.musd === 0n && (
              <Notice tone="info" title="No MUSD on Mezo yet">
                Get the free route kit on the <Link className="underline underline-offset-4" href="/start">Try it</Link> page: test MUSD plus gas on both chains, sent to you.
              </Notice>
            )}
            <div>
              <label htmlFor="lock-recipient" className="text-sm text-ink-300">
                Receive on Base Sepolia at
              </label>
              <input disabled={busy} id="lock-recipient" value={recipient} onChange={(e) => setRecipient(e.target.value.trim())} spellCheck={false} placeholder="0x…" aria-invalid={!recipientOk && recipient !== ""} className={cn("num mt-2 h-11 w-full rounded-sm border bg-ink-950 px-3 text-sm text-bone-100 outline-none focus:border-ember-500", recipientOk || !recipient ? "border-ink-600" : "border-rust-500")} />
              <p className="mt-1.5 text-xs text-ink-400">Your own address by default.</p>
            </div>
          </Panel>
          <Panel plain className="space-y-4">
            <StepList
              steps={[
                { key: "approve", title: `Approve ${unit}`, chain: "Mezo testnet", state: approve.state, done: approve.state.phase === "confirmed" || (!!i && !needsApproval && !!amount.parsed), skipped: !!i && !needsApproval && approve.state.phase === "idle" },
                { key: "lock", title: src === "MUSD" ? "Save on Mezo and send the receipt to Base" : "Send to Base", chain: "Mezo testnet", state: lock.state, done: lock.state.phase === "confirmed" },
              ]}
            />
            {i?.paused && <Notice tone="pending">Sending to Base is paused by the guardian. Bringing savings home still works.</Notice>}
            <TransactionReadiness chainId={MEZO_ID} cost={cost} />
            <Button className="w-full" size="lg" busy={busy} disabled={!deployed || !connected || !amount.parsed || over || !recipientOk || !i || i.paused || chainId !== MEZO_ID || !pos.isSuccess || info.isError || !cost.isSuccess || !cost.data.sufficient} onClick={submit}>
              {!deployed ? "Unavailable until deployment" : !connected ? "Connect a wallet" : !amount.parsed ? "Enter an amount" : over ? `Not enough ${unit}` : !recipientOk ? "Check the Base address" : readinessLabel(pos, cost) ?? (needsApproval ? `Approve ${unit}, then send` : src === "MUSD" ? "Save and send to Base" : "Send to Base")}
            </Button>
            <NetworkHint chainId={MEZO_ID} />
          </Panel>
        </div>
        <div className="space-y-6">
          <Panel plain>
            <h2 className="text-lg font-semibold tracking-[-0.02em] text-bone-50">What you get</h2>
            <dl className="mt-4">
              <Row label="You send">{amount.parsed ? <Amount value={amount.parsed} unit={unit} places={4} /> : "—"}</Row>
              <Row label="Saved on Mezo" hint="Mezo's Savings Vault, still earning">{i?.value != null ? <Amount value={i.value} unit="MUSD" places={4} /> : "—"}</Row>
              <Row label="You receive on Base" hint={src === "MUSD" ? "rwSMUSD, quoted now; at least 99.5% of this" : "rwSMUSD, exactly equal"}>{i?.shares != null ? <Amount value={i.shares} unit="rwSMUSD" places={4} /> : "—"}</Row>
              <Row label="Fees">{i ? `No Reach fee · Wormhole ${formatAmount(i.fee, 18, 8)} BTC + gas` : "—"}</Row>
              <Row label="Approval goes to" hint="Reach source gateway, exact amount">{d ? <Hash value={d.sourceGateway} href={explorer.mezoAddress(d.sourceGateway)} /> : "—"}</Row>
            </dl>
            <p className="mt-5 border-t border-ink-700 pt-5 text-xs leading-relaxed text-ink-300">
              rwSMUSD is minted on Base only after Wormhole&apos;s guardian signs the message, exactly once. Until then your savings sit safely on Mezo and the tracker shows progress. Bring them home any time from <Link className="underline underline-offset-4" href="/app/redeem">Redeem</Link>.
            </p>
          </Panel>
        </div>
      </TransactionWorkspace>
    </>
  );
}
