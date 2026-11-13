"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { erc20Abi, type Hex } from "viem";
import { fetchSignedVaa } from "@musd-reach/sdk";
import { Amount, Button, Chip, Hash, Notice, Panel, Row, Skeleton } from "@/components/ui/primitives";
import { PageTitle, useGate, AmountField, useAmount, StepList, NetworkHint, type FlowStep } from "@/components/app/AppKit";
import { TransactionWorkspace, FlowIntro } from "@/components/app/Workspace";
import { useContractTx } from "@/lib/tx";
import { useClients } from "@/lib/hooks";
import { explorer, reachConfig } from "@/lib/reach";
import { cn } from "@/lib/cn";
import { bridgeSides, parsePending, pendingRaw, nttManagerAbi, savePending, sequenceFrom, transceiverAbi, transferArgs, type BridgeChain, type PendingBridge } from "@/lib/mezoBridge";

const noSubscribe = () => () => {};
const chainLabel = (c: BridgeChain) => (c === "mezo" ? "Mezo testnet" : "Base Sepolia");

export default function BridgePage() {
  const { address, connected } = useGate();
  const qc = useQueryClient();
  const c = useClients();
  const [from, setFrom] = useState<BridgeChain>("mezo");
  const to: BridgeChain = from === "mezo" ? "base" : "mezo";
  const src = bridgeSides[from];
  const dst = bridgeSides[to];
  const amount = useAmount(18);
  const approve = useContractTx();
  const send = useContractTx();
  const deliver = useContractTx();
  // undefined = follow what this browser stored; null or a value = set in this session.
  const stored = useSyncExternalStore(noSubscribe, pendingRaw, () => null);
  const [override, setPending] = useState<PendingBridge | null | undefined>(undefined);
  const storedPending = useMemo(() => parsePending(stored), [stored]);
  const pending = override === undefined ? storedPending : override;
  const busy = [approve, send, deliver].some((t) => ["switching", "simulating", "signing", "pending"].includes(t.state.phase));

  const balances = useQuery({
    queryKey: ["mezo-bridge-balances", address],
    enabled: !!c && !!address,
    refetchInterval: 15_000,
    queryFn: async () => {
      const [mezo, base, allowMezo, allowBase] = await Promise.all([
        c!.mezo.readContract({ address: bridgeSides.mezo.musd, abi: erc20Abi, functionName: "balanceOf", args: [address!] }),
        c!.base.readContract({ address: bridgeSides.base.musd, abi: erc20Abi, functionName: "balanceOf", args: [address!] }),
        c!.mezo.readContract({ address: bridgeSides.mezo.musd, abi: erc20Abi, functionName: "allowance", args: [address!, bridgeSides.mezo.manager] }),
        c!.base.readContract({ address: bridgeSides.base.musd, abi: erc20Abi, functionName: "allowance", args: [address!, bridgeSides.base.manager] }),
      ]);
      return { mezo, base, allow: { mezo: allowMezo, base: allowBase } };
    },
  });

  const vaa = useQuery({
    queryKey: ["mezo-bridge-vaa", pending?.from, pending?.sequence],
    enabled: !!pending,
    refetchInterval: (q) => (q.state.data?.status === "signed" ? false : 15_000),
    queryFn: () =>
      fetchSignedVaa({
        api: reachConfig.wormhole.api,
        emitterChainId: bridgeSides[pending!.from].wormholeChainId,
        emitter: bridgeSides[pending!.from].transceiver,
        sequence: BigInt(pending!.sequence),
      }),
  });

  if (!connected)
    return (
      <FlowIntro
        title="Move MUSD between Mezo and Base."
        description="Uses Mezo's own canonical MUSD bridge (Wormhole NTT): MUSD is locked on Mezo and minted on Base, or burned on Base and released on Mezo. Bring borrowed MUSD home and save it again, or take MUSD to Base to lend it."
        requirements={["MUSD on the sending chain, and gas on both chains: the free route kit on the Try it page has all of it"]}
        steps={["Approve MUSD to Mezo's bridge on the sending chain.", "Send: the bridge locks or burns it and publishes a Wormhole message.", "Wait for the Wormhole guardians to sign (a few minutes on testnet).", "Deliver the signed message on the other chain; MUSD arrives in your wallet."]}
        docs="/docs/mezo"
      />
    );

  const amt = amount.parsed ?? 0n;
  const have = balances.data ? balances.data[from] : null;
  const allowance = balances.data ? balances.data.allow[from] : 0n;
  const refresh = () => qc.invalidateQueries({ queryKey: ["mezo-bridge-balances"] });

  async function doSend() {
    if (!address || amt === 0n) return;
    if (allowance < amt) {
      const r = await approve.run({ chainId: src.chainId, address: src.musd, abi: erc20Abi, functionName: "approve", args: [src.manager, amt] });
      if (!r) return;
    }
    const r = await send.run({ chainId: src.chainId, address: src.manager, abi: nttManagerAbi, functionName: "transfer", args: transferArgs(amt, to, address) });
    if (!r) return;
    const seq = sequenceFrom(r, from);
    if (seq === null) return;
    const p: PendingBridge = { from, amount: amt.toString(), sequence: seq.toString(), txHash: r.transactionHash, at: Date.now() };
    savePending(p);
    setPending(p);
    amount.setValue("");
    refresh();
  }

  async function doDeliver() {
    if (!pending || vaa.data?.status !== "signed") return;
    const target = bridgeSides[pending.from === "mezo" ? "base" : "mezo"];
    const r = await deliver.run({ chainId: target.chainId, address: target.transceiver, abi: transceiverAbi, functionName: "receiveMessage", args: [vaa.data.vaa as Hex] });
    if (r) {
      savePending(null);
      setPending(null);
      refresh();
    }
  }

  const steps: FlowStep[] = [
    { key: "approve", title: `Approve MUSD to Mezo's bridge on ${chainLabel(from)}`, chain: from === "mezo" ? "Mezo testnet" : "Base Sepolia", state: approve.state, done: approve.state.phase === "confirmed", skipped: amt > 0n && allowance >= amt && approve.state.phase === "idle" },
    { key: "send", title: from === "mezo" ? "Lock MUSD on Mezo and publish the transfer" : "Burn MUSD on Base and publish the transfer", chain: from === "mezo" ? "Mezo testnet" : "Base Sepolia", state: send.state, done: send.state.phase === "confirmed" },
  ];
  const pendingTo: BridgeChain | null = pending ? (pending.from === "mezo" ? "base" : "mezo") : null;
  const over = have !== null && amt > have;

  return (
    <>
      <PageTitle kicker="Bridge MUSD" title={<>MUSD between Mezo and Base. <span className="font-serif italic text-ember-400">On Mezo&apos;s own bridge.</span></>}>
        This page drives Mezo&apos;s canonical MUSD bridge (Wormhole NTT) directly: MUSD is locked on Mezo and minted on Base, or burned on Base and released on Mezo. Reach adds no contract and no fee here. You deliver the guardian-signed message yourself, so no relayer is needed.
      </PageTitle>
      <TransactionWorkspace>
        <div className="space-y-6">
          {pending && pendingTo && (
            <Panel plain className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold tracking-[-0.02em] text-bone-50">Transfer in flight</h2>
                <Chip tone={vaa.data?.status === "signed" ? "verified" : "pending"}>{vaa.data?.status === "signed" ? "Signed: ready to deliver" : "Waiting for guardians"}</Chip>
              </div>
              <dl>
                <Row label="Amount"><Amount value={BigInt(pending.amount)} unit="MUSD" places={2} /></Row>
                <Row label="Route">{chainLabel(pending.from)} → {chainLabel(pendingTo)}</Row>
                <Row label="Sent in"><Hash value={pending.txHash} href={pending.from === "mezo" ? explorer.mezoTx(pending.txHash) : explorer.baseTx(pending.txHash)} /></Row>
                <Row label="Wormhole message"><a className="underline underline-offset-4" href={explorer.wormholescan(bridgeSides[pending.from].wormholeChainId, bridgeSides[pending.from].transceiver, pending.sequence)} target="_blank" rel="noreferrer">Sequence {pending.sequence}</a></Row>
              </dl>
              <StepList steps={[{ key: "deliver", title: `Deliver on ${chainLabel(pendingTo)}: MUSD arrives in your wallet`, chain: pendingTo === "mezo" ? "Mezo testnet" : "Base Sepolia", state: deliver.state, done: deliver.state.phase === "confirmed" }]} />
              <Button className="w-full" size="lg" busy={busy} disabled={busy || vaa.data?.status !== "signed"} onClick={doDeliver}>
                {vaa.data?.status === "signed" ? `Deliver on ${chainLabel(pendingTo)}` : "Waiting for guardian signatures…"}
              </Button>
              <p className="text-xs text-ink-400">Guardians sign once the sending chain finalizes the block, usually a few minutes on testnet. You can leave this page and come back: the transfer is remembered in this browser.</p>
            </Panel>
          )}
          <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Direction">
            {(["mezo", "base"] as const).map((f) => (
              <button key={f} role="tab" type="button" aria-selected={from === f} disabled={busy} onClick={() => { setFrom(f); amount.setValue(""); }} className={cn("rounded-sm border px-3 py-2.5 text-left transition-colors", from === f ? "border-ember-500 bg-ember-500/[0.06]" : "border-ink-600 hover:border-ink-400")}>
                <span className="block text-sm font-medium text-bone-50">{f === "mezo" ? "Mezo → Base" : "Base → Mezo"}</span>
                <span className="block text-xs text-ink-400">{f === "mezo" ? "Take MUSD to Base to lend it" : "Bring borrowed MUSD home"}</span>
              </button>
            ))}
          </div>
          <Panel plain className="space-y-6">
            <AmountField id="bridge-amt" label={`MUSD to send from ${chainLabel(from)}`} unit="MUSD" value={amount.value} onChange={amount.setValue} max={have} disabled={busy || !!pending} />
            <StepList steps={steps} />
            <Button className="w-full" size="lg" busy={busy} disabled={busy || !!pending || amt === 0n || over || !balances.data} onClick={doSend}>
              {pending ? "Deliver the transfer in flight first" : !balances.data ? "Loading" : amt === 0n ? "Enter an amount" : over ? "Insufficient MUSD" : `Send to ${chainLabel(to)}`}
            </Button>
            {balances.data && balances.data.mezo === 0n && balances.data.base === 0n && (
              <Notice tone="info" title="No MUSD yet">
                Claim the free <Link className="underline underline-offset-4" href="/start">route kit</Link> on Mezo, or borrow MUSD against your savings on <Link className="underline underline-offset-4" href="/app/borrow?asset=MUSD">Borrow</Link>.
              </Notice>
            )}
            <NetworkHint chainId={src.chainId} />
          </Panel>
        </div>
        <div className="space-y-6">
          <Panel plain>
            <h2 className="text-lg font-semibold tracking-[-0.02em] text-bone-50">Your MUSD</h2>
            <dl className="mt-4">
              <Row label="On Mezo testnet">{balances.data ? <Amount value={balances.data.mezo} unit="MUSD" places={2} /> : <Skeleton className="h-4 w-24" />}</Row>
              <Row label="On Base Sepolia">{balances.data ? <Amount value={balances.data.base} unit="MUSD" places={2} /> : <Skeleton className="h-4 w-24" />}</Row>
            </dl>
          </Panel>
          <Panel plain>
            <h2 className="text-lg font-semibold tracking-[-0.02em] text-bone-50">Mezo&apos;s bridge</h2>
            <dl className="mt-4">
              <Row label="Mezo NttManager" hint="Locks MUSD"><Hash value={bridgeSides.mezo.manager} href={explorer.mezoAddress(bridgeSides.mezo.manager)} /></Row>
              <Row label="Base NttManager" hint="Mints and burns MUSD"><Hash value={bridgeSides.base.manager} href={explorer.baseAddress(bridgeSides.base.manager)} /></Row>
              <Row label="MUSD on Base"><Hash value={bridgeSides.base.musd} href={explorer.baseAddress(bridgeSides.base.musd)} /></Row>
              <Row label="Destination">{dst.label}</Row>
            </dl>
            <p className="mt-5 border-t border-ink-700 pt-5 text-xs leading-relaxed text-ink-300">
              Borrowed MUSD on Base is the same canonical MUSD. Bring it home and <Link className="underline underline-offset-4" href="/app/portable/new">save it on Mezo</Link> again: every loop adds MUSD to Mezo&apos;s Savings Vault.
            </p>
          </Panel>
        </div>
      </TransactionWorkspace>
    </>
  );
}
