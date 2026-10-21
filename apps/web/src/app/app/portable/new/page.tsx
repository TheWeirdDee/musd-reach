"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { erc20Abi, isAddress, type Address } from "viem";
import { reachSourceGatewayAbi, reachSavingsWrapperAbi, formatAmount } from "@musd-reach/sdk";
import { Amount, Button, Hash, Notice, Panel, Row } from "@/components/ui/primitives";
import { PageTitle, NotDeployedNotice, ConnectPrompt, useGate, AmountField, useAmount, StepList, NetworkHint } from "@/components/app/AppKit";
import { useClients, usePosition } from "@/lib/hooks";
import { useContractTx } from "@/lib/tx";
import { parseLock } from "@/lib/events";
import { saveLocalTransfer } from "@/lib/pending";
import { reachConfig, explorer, MEZO_ID } from "@/lib/reach";
import { cn } from "@/lib/cn";

export default function MakePortablePage() {
  const { address, connected, deployed } = useGate();
  const d = reachConfig.deployment;
  const clients = useClients();
  const qc = useQueryClient();
  const router = useRouter();
  const pos = usePosition(address);
  const amount = useAmount();
  const [recipientInput, setRecipient] = useState<string | null>(null);
  // Defaults to the connected account until the user edits it.
  const recipient = recipientInput ?? address ?? "";
  const approve = useContractTx();
  const lock = useContractTx();


  const info = useQuery({
    queryKey: ["lock-info", address, amount.parsed?.toString()],
    enabled: !!clients && !!d && !!address,
    refetchInterval: 15_000,
    queryFn: async () => {
      const m = clients!.mezo;
      const [allowance, fee, paused, value] = await Promise.all([
        m.readContract({ address: d!.wrapper, abi: erc20Abi, functionName: "allowance", args: [address!, d!.sourceGateway] }),
        m.readContract({ address: d!.sourceGateway, abi: reachSourceGatewayAbi, functionName: "messageFee" }),
        m.readContract({ address: d!.sourceGateway, abi: reachSourceGatewayAbi, functionName: "issuancePaused" }),
        amount.parsed ? m.readContract({ address: d!.wrapper, abi: reachSavingsWrapperAbi, functionName: "convertToAssets", args: [amount.parsed] }) : Promise.resolve(null),
      ]);
      return { allowance, fee, paused, value };
    },
  });
  const i = info.data;
  const needsApproval = !!i && !!amount.parsed && i.allowance < amount.parsed;
  const balance = pos.data ? pos.data.wsmusd : null;
  const over = balance !== null && !!amount.parsed && amount.parsed > balance;
  const recipientOk = isAddress(recipient);
  const busy = [approve.state.phase, lock.state.phase].some((p) => ["switching", "simulating", "signing", "pending"].includes(p));

  async function submit() {
    if (!d || !amount.parsed || !i) return;
    if (needsApproval) {
      const r = await approve.run({ chainId: MEZO_ID, address: d.wrapper, abi: erc20Abi, functionName: "approve", args: [d.sourceGateway, amount.parsed] });
      if (!r) return;
    }
    const receipt = await lock.run({ chainId: MEZO_ID, address: d.sourceGateway, abi: reachSourceGatewayAbi, functionName: "lockAndIssue", args: [amount.parsed, recipient as Address], value: i.fee });
    if (!receipt) return;
    qc.invalidateQueries({ queryKey: ["position"] });
    const ev = parseLock(receipt, d.sourceGateway);
    if (ev) {
      saveLocalTransfer({ transferId: ev.transferId, direction: "ISSUE", originTx: receipt.transactionHash, sequence: ev.sequence.toString(), shares: ev.shares.toString(), recipient: ev.recipient, account: address!, createdAt: Date.now() });
      router.push(`/app/transfers/${ev.transferId}?tx=${receipt.transactionHash}&dir=ISSUE&seq=${ev.sequence}`);
    }
  }

  return (
    <>
      <PageTitle kicker="Make portable" title="Lock wSMUSD, receive rwSMUSD on Base">
        Exactly the shares you lock are minted on Base, once, after the guardian-signed message is verified there. The locked shares keep earning wrapper yield the whole time.
      </PageTitle>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="space-y-6">
          {!deployed && <NotDeployedNotice />}
          <Panel className="space-y-6 p-6">
            <AmountField id="lock-amount" label="wSMUSD to lock" unit="wSMUSD" value={amount.value} onChange={amount.setValue} max={connected ? balance : undefined} disabled={!deployed} />
            <div>
              <label htmlFor="lock-recipient" className="text-sm text-ink-300">
                Recipient on Base Sepolia
              </label>
              <input id="lock-recipient" value={recipient} onChange={(e) => setRecipient(e.target.value.trim())} spellCheck={false} placeholder="0x…" aria-invalid={!recipientOk && recipient !== ""} className={cn("num mt-2 h-11 w-full rounded-sm border bg-ink-950 px-3 text-sm text-bone-100 outline-none focus:border-ember-500", recipientOk || !recipient ? "border-ink-600" : "border-rust-500")} />
            </div>
          </Panel>
          {!connected && <ConnectPrompt what="lock wrapper shares" />}
        </div>
        <div className="space-y-6">
          <Panel className="p-6">
            <h2 className="text-lg font-semibold tracking-[-0.02em] text-bone-50">Review before signing</h2>
            <dl className="mt-4">
              <Row label="From">Mezo testnet → custody in ReachSourceGateway</Row>
              <Row label="To">Base Sepolia rwSMUSD</Row>
              <Row label="Shares locked">{amount.parsed ? <Amount value={amount.parsed} unit="wSMUSD" places={6} /> : "—"}</Row>
              <Row label="rwSMUSD minted" hint="Exactly equal, after verification">{amount.parsed ? <Amount value={amount.parsed} unit="rwSMUSD" places={6} /> : "—"}</Row>
              <Row label="Indicative value" hint="Wrapper NAV now; not a guarantee">{i?.value ? <Amount value={i.value} unit="MUSD" /> : "—"}</Row>
              <Row label="Fees">{i ? `No Reach fee · Wormhole ${formatAmount(i.fee, 18, 8)} BTC` : "—"}</Row>
              <Row label="Approval scope">{d ? <Hash value={d.sourceGateway} href={explorer.mezoAddress(d.sourceGateway)} /> : "—"}</Row>
            </dl>
          </Panel>
          <Panel className="space-y-4 p-6">
            <StepList
              steps={[
                { key: "approve", title: "Approve exact wSMUSD amount", chain: "Mezo testnet", state: approve.state, done: approve.state.phase === "confirmed" || (!!i && !needsApproval && !!amount.parsed), skipped: !!i && !needsApproval && approve.state.phase === "idle" },
                { key: "lock", title: "Lock shares and publish ISSUE", chain: "Mezo testnet", state: lock.state, done: lock.state.phase === "confirmed" },
              ]}
            />
            {i?.paused && <Notice tone="pending">New locks are paused by the guardian. Redemptions still release.</Notice>}
            <Button className="w-full" size="lg" busy={busy} disabled={!deployed || !connected || !amount.parsed || over || !recipientOk || !i || i.paused} onClick={submit}>
              {!deployed ? "Unavailable until deployment" : !connected ? "Connect a wallet" : !amount.parsed ? "Enter an amount" : over ? "Insufficient wSMUSD" : needsApproval ? "Approve, then lock" : "Lock and make portable"}
            </Button>
            <NetworkHint chainId={MEZO_ID} />
          </Panel>
        </div>
      </div>
    </>
  );
}
