"use client";

import Link from "next/link";
import { Suspense, useMemo } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Hex } from "viem";
import { fetchSignedVaa, parseVaa, reachDestinationGatewayAbi, reachSourceGatewayAbi, shortHex } from "@musd-reach/sdk";
import { Amount, Arrow, Button, Chip, Hash, Notice, Panel, Row, Skeleton, type Tone } from "@/components/ui/primitives";
import { PageTitle, NotDeployedNotice, useGate } from "@/components/app/AppKit";
import { useApi, useClients, useSlowLoad } from "@/lib/hooks";
import { ApiWakingNotice } from "@/components/app/ApiWaking";
import { useContractTx, phaseLabel } from "@/lib/tx";
import { parseBurn, parseLock } from "@/lib/events";
import { findLocalTransfer } from "@/lib/pending";
import { reachConfig, explorer, MEZO_ID, BASE_ID, isForkMode, settlementModel } from "@/lib/reach";
import { useAccount } from "wagmi";
import { parseAmount, formatAmount } from "@musd-reach/sdk";
import { useState } from "react";
import { settlementCopy } from "@/lib/settlement";

type Stage = { title: string; tone: Tone; detail: React.ReactNode; pulse?: boolean };

type PendingEntry = { recipient: Hex; shares: bigint; minAssets: bigint };

/** One cache entry, one shape: the source gateway's pendingSettlements(id). */
function usePendingSettlement(id: Hex, enabled: boolean) {
  const clients = useClients();
  const d = reachConfig.deployment;
  return useQuery({
    queryKey: ["pending-settlement", id],
    enabled: enabled && !!clients && !!d,
    refetchInterval: 15_000,
    queryFn: async (): Promise<PendingEntry> => {
      const [recipient, shares, minAssets] = (await clients!.mezo.readContract({
        address: d!.sourceGateway,
        abi: reachSourceGatewayAbi,
        functionName: "pendingSettlements",
        args: [id],
      })) as readonly [Hex, bigint, bigint];
      return { recipient, shares, minAssets };
    },
  });
}

/** v2 only: a delivered MUSD redemption that could not settle yet. */
function PendingSettlementPanel({ id }: { id: Hex }) {
  const d = reachConfig.deployment!;
  const qc = useQueryClient();
  const { address } = useAccount();
  const retry = useContractTx();
  const lower = useContractTx();
  const take = useContractTx();
  const [minInput, setMinInput] = useState("");
  const q = usePendingSettlement(id, true);
  if (!q.data || q.data.shares === 0n) return null;
  const p = q.data;
  const isRecipient = !!address && address.toLowerCase() === p.recipient.toLowerCase();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["pending-settlement", id] });
    qc.invalidateQueries({ queryKey: ["position"] });
  };
  let lowerMin: bigint | null = null;
  try {
    lowerMin = minInput ? parseAmount(minInput) : null;
  } catch {
    lowerMin = null;
  }
  const busy = (s: { phase: string }) => ["switching", "simulating", "signing", "pending"].includes(s.phase);
  return (
    <Panel className="space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold text-bone-50">MUSD settlement pending</h3>
        <Chip tone="pending" pulse>Shares held for recipient</Chip>
      </div>
      <p className="text-sm leading-relaxed text-ink-300">
        The return message was verified, but paying <Amount value={p.shares} unit="wSMUSD" /> out as MUSD (minimum <Amount value={p.minAssets} unit="MUSD" />) could not complete yet. The shares are held in custody for{" "}
        <Hash value={p.recipient} href={explorer.mezoAddress(p.recipient)} />. Nobody else can change the payout asset.
      </p>
      <Button intent="secondary" className="w-full" busy={busy(retry.state)} onClick={async () => (await retry.run({ chainId: MEZO_ID, address: d.sourceGateway, abi: reachSourceGatewayAbi, functionName: "retrySettlement", args: [id] })) && refresh()}>
        Retry settlement (original minimum)
      </Button>
      {retry.state.error && <p className="text-xs text-rust-300">{retry.state.error}</p>}
      {isRecipient ? (
        <div className="space-y-3 border-t border-ink-700 pt-4">
          <p className="text-xs text-ink-300">You are the recipient. You may accept a lower minimum, or take the wSMUSD shares instead.</p>
          <div className="flex gap-2">
            <input aria-label="New minimum MUSD" value={minInput} onChange={(e) => setMinInput(e.target.value)} placeholder={formatAmount(p.minAssets, 18, 6)} className="num h-11 min-w-0 flex-1 rounded-sm border border-ink-600 bg-ink-950 px-3 text-sm text-bone-100 outline-none focus:border-ember-500" />
            <Button intent="secondary" disabled={lowerMin === null} busy={busy(lower.state)} onClick={async () => lowerMin !== null && (await lower.run({ chainId: MEZO_ID, address: d.sourceGateway, abi: reachSourceGatewayAbi, functionName: "settleWithMinAssets", args: [id, lowerMin] })) && refresh()}>
              Settle
            </Button>
          </div>
          {lower.state.error && <p className="text-xs text-rust-300">{lower.state.error}</p>}
          <Button intent="ghost" className="w-full justify-start px-0" busy={busy(take.state)} onClick={async () => (await take.run({ chainId: MEZO_ID, address: d.sourceGateway, abi: reachSourceGatewayAbi, functionName: "claimSharesInstead", args: [id] })) && refresh()}>
            Take wSMUSD shares instead
          </Button>
          {take.state.error && <p className="text-xs text-rust-300">{take.state.error}</p>}
        </div>
      ) : (
        <p className="text-xs text-ink-400">Connect as the recipient to lower the minimum or take shares.</p>
      )}
    </Panel>
  );
}

function Tracker() {
  const { id } = useParams<{ id: string }>();
  const sp = useSearchParams();
  const { connected } = useGate();
  const d = reachConfig.deployment;
  const clients = useClients();
  const qc = useQueryClient();
  const deliver = useContractTx();
  const valid = /^0x[0-9a-fA-F]{64}$/.test(id ?? "");

  const local = useMemo(() => (valid ? findLocalTransfer(id) : undefined), [id, valid]);
  const api = useApi<{ transfer: { direction: string; origin_tx: string; wormhole_sequence: string } | null }>(valid && !sp.get("tx") && !local ? `/v1/transfers/${id}` : null);
  const apiWaking = useSlowLoad(api.isPending && api.fetchStatus === "fetching");
  const originTx = (sp.get("tx") ?? local?.originTx ?? api.data?.transfer?.origin_tx) as Hex | undefined;
  const dir = (sp.get("dir") ?? local?.direction ?? api.data?.transfer?.direction) as "ISSUE" | "REDEEM" | undefined;
  const issue = dir === "ISSUE";

  const origin = useQuery({
    queryKey: ["origin", originTx, dir],
    enabled: !!clients && !!d && !!originTx && !!dir,
    refetchInterval: (q) => (q.state.data?.finalized ? false : 10_000),
    queryFn: async () => {
      const c = issue ? clients!.mezo : clients!.base;
      const receipt = await c.getTransactionReceipt({ hash: originTx! });
      const ev = issue ? parseLock(receipt, d!.sourceGateway) : parseBurn(receipt, d!.destinationGateway);
      if (!ev || ev.transferId.toLowerCase() !== id.toLowerCase()) throw new Error("That transaction did not create this transfer id.");
      // Mezo has instant finality; Base needs its finalized head to pass the burn block.
      const finalizedHead = issue ? receipt.blockNumber : (await c.getBlock({ blockTag: isForkMode ? "latest" : "finalized" })).number;
      return { receipt, ev, finalized: finalizedHead >= receipt.blockNumber, finalizedHead };
    },
  });

  const consumed = useQuery({
    queryKey: ["consumed", id],
    enabled: !!clients && !!d && valid && !!dir,
    refetchInterval: (q) => (q.state.data ? false : 12_000),
    queryFn: () =>
      issue
        ? clients!.base.readContract({ address: d!.destinationGateway, abi: reachDestinationGatewayAbi, functionName: "transferConsumed", args: [id as Hex] })
        : clients!.mezo.readContract({ address: d!.sourceGateway, abi: reachSourceGatewayAbi, functionName: "transferConsumed", args: [id as Hex] }),
  });

  const vaa = useQuery({
    queryKey: ["vaa", id, origin.data?.ev.sequence?.toString()],
    enabled: !!origin.data && origin.data.finalized && consumed.data === false && !isForkMode,
    refetchInterval: (q) => (q.state.data?.status === "signed" ? false : 20_000),
    queryFn: () =>
      fetchSignedVaa({
        api: reachConfig.wormhole.api,
        emitterChainId: issue ? reachConfig.mezo.wormholeChainId : reachConfig.base.wormholeChainId,
        emitter: issue ? d!.sourceGateway : d!.destinationGateway,
        sequence: origin.data!.ev.sequence,
      }),
  });

  // v2: a consumed MUSD redemption may still be a pending settlement (not yet paid).
  const pendingQ = usePendingSettlement(id as Hex, valid && dir === "REDEEM" && settlementModel === "pending-v2" && consumed.data === true);
  const settlementUnknown = dir === "REDEEM" && settlementModel === "pending-v2" && !pendingQ.isSuccess;
  const settlementPending = (pendingQ.data?.shares ?? 0n) > 0n;

  if (!valid) return <Notice tone="failed" title="Not a transfer id">Transfer ids are 32-byte hex values (0x + 64 characters).</Notice>;
  if (!d) return <NotDeployedNotice />;
  if (!originTx || !dir) {
    // Still asking the history service: don't claim it has no record before it has answered.
    if (api.isPending && api.fetchStatus === "fetching") return apiWaking ? <ApiWakingNotice /> : <p className="text-sm text-ink-300" aria-live="polite">Looking up this transfer…</p>;
    return (
      <Notice tone="pending" title="Origin transaction unknown">
        This browser has no record of transfer <span className="num break-hash">{id}</span>, and the history service {api.isError ? "is unreachable" : "has not indexed it"}. Open the tracker link from the original transaction, or add <span className="num">?tx=&lt;hash&gt;&amp;dir=ISSUE|REDEEM</span>.
      </Notice>
    );
  }

  const o = origin.data;
  const delivered = consumed.data === true;
  const signedVaa = vaa.data?.status === "signed" ? vaa.data.vaa : undefined;
  const originChainName = issue ? "Mezo testnet" : "Base Sepolia";
  const targetChainName = issue ? "Base Sepolia" : "Mezo testnet";

  const stages: Stage[] = [
    {
      title: issue ? "Shares locked on Mezo" : "Receipt burned on Base",
      tone: o ? "verified" : origin.isError ? "failed" : "pending",
      pulse: !o && !origin.isError,
      detail: o ? (
        <>
          <Amount value={o.ev.shares} unit={issue ? "wSMUSD" : "rwSMUSD"} places={6} /> in block <span className="num">{o.receipt.blockNumber.toString()}</span> · <Hash value={originTx} href={(issue ? explorer.mezoTx : explorer.baseTx)(originTx)} />
        </>
      ) : origin.isError ? (
        (origin.error as Error).message.split("\n")[0]
      ) : (
        "Reading the origin transaction…"
      ),
    },
    {
      title: `${originChainName} finality`,
      tone: o?.finalized ? "verified" : "pending",
      pulse: !!o && !o.finalized,
      detail: !o ? "—" : o.finalized ? (issue ? "Mezo finalizes instantly." : `Finalized (head ${o.finalizedHead.toString()}).`) : `Waiting: finalized head ${o.finalizedHead.toString()} < burn block ${o.receipt.blockNumber.toString()}. Base Sepolia finality usually takes tens of minutes.`,
    },
    {
      title: "Guardian signature",
      tone: delivered || signedVaa ? "verified" : vaa.data?.status === "error" ? "failed" : "pending",
      pulse: !delivered && !signedVaa && !!o?.finalized,
      detail: delivered
        ? "Signed and already consumed on the target chain."
        : isForkMode
          ? "Local fork mode: Wormhole guardians do not observe forks; a local key stands in for them."
          : signedVaa
            ? <>VAA digest <span className="num">{shortHex(parseVaa(signedVaa).digest, 8, 6)}</span> from Wormholescan. The target contract re-verifies every signature.</>
            : vaa.data?.status === "error"
              ? `Wormholescan error: ${vaa.data.error}. Retrying.`
              : o?.finalized
                ? "Waiting for the guardians to observe and sign."
                : "Starts after origin finality.",
    },
    {
      title: issue ? "Verified and minted on Base" : settlementUnknown ? "Verified on Mezo · checking settlement" : settlementPending ? "Verified on Mezo · MUSD settlement pending" : "Verified and released on Mezo",
      tone: delivered ? (settlementUnknown || settlementPending ? "pending" : "verified") : "neutral",
      pulse: delivered && (settlementUnknown || settlementPending),
      detail: delivered
        ? issue
          ? "transferConsumed is true on the destination gateway: exactly this amount of rwSMUSD was minted to the recipient, once."
          : settlementUnknown
            ? "The return message was consumed. A successful pending-settlement read is still needed to confirm whether the payout completed."
          : settlementPending
            ? "The return message was verified and consumed, but the MUSD payout has not settled. The shares are held in custody for the recipient; see the panel on the right."
            : "transferConsumed is true on the source gateway and no settlement is pending: exactly this amount was paid out once, as wSMUSD or MUSD per the burner's choice."
        : `Not yet. ${issue ? "Shares are locked on Mezo; the receipt is not minted yet." : "Receipt burned on Base; waiting for authenticated Mezo release."}`,
    },
  ];

  async function deliverNow() {
    if (!signedVaa || !d) return;
    const r = issue
      ? await deliver.run({ chainId: BASE_ID, address: d.destinationGateway, abi: reachDestinationGatewayAbi, functionName: "receiveIssue", args: [signedVaa] })
      : await deliver.run({ chainId: MEZO_ID, address: d.sourceGateway, abi: reachSourceGatewayAbi, functionName: "receiveRedeem", args: [signedVaa] });
    if (r) {
      qc.invalidateQueries({ queryKey: ["consumed", id] });
      qc.invalidateQueries({ queryKey: ["position"] });
    }
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
      <Panel className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-bone-50">{issue ? "Mezo → Base" : "Base → Mezo"}</h2>
          <Chip tone={delivered && !settlementUnknown && !settlementPending ? "verified" : "pending"} pulse={!delivered || settlementUnknown || settlementPending}>
            {delivered ? (issue ? "Backed on Base" : settlementUnknown ? "Delivered · checking settlement" : settlementPending ? "Delivered · settlement pending" : "Released on Mezo") : issue ? "Locked · not minted yet" : "Burned · awaiting release"}
          </Chip>
        </div>
        <ol className="relative mt-6 space-y-6 before:absolute before:bottom-2 before:left-[11px] before:top-2 before:w-px before:bg-ink-700" aria-label="Transfer stages">
          {stages.map((s) => (
            <li key={s.title} className="relative flex gap-4 pl-0">
              <span className={`relative z-10 mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border bg-ink-900 ${s.tone === "verified" ? "border-sage-400" : s.tone === "failed" ? "border-rust-400" : "border-ink-500"}`} aria-hidden>
                <span className={`h-2 w-2 rounded-full ${s.tone === "verified" ? "bg-sage-400" : s.tone === "failed" ? "bg-rust-400" : s.pulse ? "animate-pulse-dot bg-sand-400" : "bg-ink-600"}`} />
              </span>
              <div className="min-w-0">
                <p className="font-medium text-bone-100">{s.title}</p>
                <div className="mt-1 text-sm leading-relaxed text-ink-300">{s.detail}</div>
              </div>
            </li>
          ))}
        </ol>
      </Panel>

      <div className="space-y-6">
        <Panel className="p-6">
          <dl>
            <Row label="Transfer id">
              <Hash value={id} />
            </Row>
            <Row label="Wormhole sequence">{o ? <span className="num">{o.ev.sequence.toString()}</span> : <Skeleton className="h-4 w-10" />}</Row>
            <Row label="Recipient">{o ? <Hash value={o.ev.recipient} href={(issue ? explorer.baseAddress : explorer.mezoAddress)(o.ev.recipient)} /> : <Skeleton className="h-4 w-24" />}</Row>
            {!issue && o && "mode" in o.ev && <Row label="Delivery">{Number((o.ev as { mode: number }).mode) === 2 ? settlementCopy.deliveryLabel : "wSMUSD shares"}</Row>}
            {o && !isForkMode && (
              <Row label="Wormholescan">
                <a className="text-sm underline decoration-ink-600 underline-offset-4 hover:text-ember-400" href={explorer.wormholescan(issue ? reachConfig.mezo.wormholeChainId : reachConfig.base.wormholeChainId, issue ? d.sourceGateway : d.destinationGateway, o.ev.sequence)} target="_blank" rel="noreferrer">
                  View message
                </a>
              </Row>
            )}
          </dl>
        </Panel>
        {!delivered && (
          <Panel className="space-y-3 p-6">
            <h3 className="font-semibold text-bone-50">Deliver it yourself</h3>
            <p className="text-sm leading-relaxed text-ink-300">
              Delivery is permissionless. You pay {targetChainName} gas; the contract verifies the guardian signatures and executes once. If someone else delivers first, this simply becomes unnecessary.
            </p>
            <Button className="w-full" disabled={!signedVaa || !connected} busy={["switching", "simulating", "signing", "pending"].includes(deliver.state.phase)} onClick={deliverNow}>
              {!connected ? "Connect a wallet to deliver" : signedVaa ? `Deliver on ${targetChainName}` : "Waiting for guardian signature"}
            </Button>
            {deliver.state.phase !== "idle" && <p className="text-xs text-ink-300">{phaseLabel[deliver.state.phase]}</p>}
            {deliver.state.hash && (
              <p className="text-xs text-ink-400">
                tx <Hash value={deliver.state.hash} href={(issue ? explorer.baseTx : explorer.mezoTx)(deliver.state.hash)} />
              </p>
            )}
            {deliver.state.error && <p className="text-xs text-rust-300">{deliver.state.error}</p>}
          </Panel>
        )}
        {delivered && !issue && settlementModel === "pending-v2" && <PendingSettlementPanel id={id as Hex} />}
        {delivered && settlementUnknown && (
          <Notice tone="pending" title={pendingQ.isError ? "Settlement status unavailable" : "Checking settlement status"}>
            {pendingQ.isError ? "The chain read failed. Delivery is confirmed, but the payout is not yet confirmed. Retrying automatically." : "Delivery is confirmed. Reading Mezo to check whether the payout settled or remains pending."}
          </Notice>
        )}
        {delivered && !settlementUnknown && !settlementPending && (
          <Notice tone="verified" title="Settled on the target chain">
            Confirm the resulting balance in your{" "}
            <Link href="/app" className="underline underline-offset-4">
              portfolio
            </Link>
            , read independently from chain. {issue ? "" : settlementModel === "pending-v2" ? "If a MUSD settlement is pending, it is shown above." : "In this deployment, if MUSD was requested and the vault could not pay your minimum, wSMUSD was delivered instead."}
          </Notice>
        )}
        <Link href="/app/history" className="inline-flex items-center gap-2 text-sm text-ink-300 hover:text-bone-100">
          All transfers <Arrow />
        </Link>
      </div>
    </div>
  );
}

export default function TransferPage() {
  return (
    <>
      <PageTitle kicker="Transfer tracker" title="Where is this claim right now?">
        Each stage is read from chain on every refresh. A transfer is complete only when the target chain has consumed its transfer id.
      </PageTitle>
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <Tracker />
      </Suspense>
    </>
  );
}
