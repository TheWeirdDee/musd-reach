"use client";

import Link from "next/link";
import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Amount, Arrow, Button, Chip, EmptyState, Notice, Panel, Hash, type Tone } from "@/components/ui/primitives";
import { PageTitle, NotDeployedNotice, ConnectPrompt, useGate } from "@/components/app/AppKit";
import { apiConfigured, useApi, useSlowLoad } from "@/lib/hooks";
import { ApiWakingNotice } from "@/components/app/ApiWaking";
import { useLocalTransfers } from "@/lib/pending";
import { apiUrl, explorer } from "@/lib/reach";

type Row = { transfer_id: string; direction: "ISSUE" | "REDEEM"; status: string; shares: string; origin_tx: string; origin_block: number; origin_time?: string | null; recipient: string; wormhole_sequence: string; musd_out: string | null };
type TransferPage = { transfers: Row[]; nextCursor: string | null };

const tone = (s: string): Tone => (["BACKED_REMOTE", "SHARES_RELEASED", "NATIVE_REDEEMED", "SHARES_CLAIMED_BY_RECIPIENT"].includes(s) ? "verified" : "pending");
const label: Record<string, string> = {
  SOURCE_LOCKED: "Locked · not minted",
  VAA_SIGNED: "Signed · awaiting delivery",
  REMOTE_MINT_PENDING_FINALITY: "Minted · finalizing",
  BACKED_REMOTE: "Backed on Base",
  REMOTE_BURN_PENDING: "Burned · finalizing",
  REMOTE_BURN_FINALIZED: "Burned · awaiting signature",
  SHARES_RELEASED: "Shares released",
  NATIVE_REDEEMED: "Redeemed to MUSD",
  SETTLEMENT_PENDING: "Delivered · MUSD settlement pending",
  SHARES_CLAIMED_BY_RECIPIENT: "Shares taken by recipient",
};

export default function HistoryPage() {
  const { address, connected, deployed } = useGate();
  const local = useLocalTransfers(address);
  const [direction, setDirection] = useState("");
  const [status, setStatus] = useState("");
  const readiness = useApi<{ ready: boolean; cursors: { next_block: string; finalized_block: string }[] }>(address ? "/ready" : null, { refetchInterval: 20_000 });
  const indexComplete = readiness.isSuccess && readiness.data.ready && readiness.data.cursors.length === 2 && readiness.data.cursors.every((c) => BigInt(c.next_block) > BigInt(c.finalized_block));
  const remote = useInfiniteQuery({
    queryKey: ["transfer-history", address, direction, status],
    enabled: deployed && !!address && apiConfigured,
    initialPageParam: null as string | null,
    getNextPageParam: (page: TransferPage) => page.nextCursor ?? undefined,
    refetchInterval: 20_000,
    retry: 1,
    queryFn: async ({ pageParam }): Promise<TransferPage> => {
      const cursor = pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : "";
      const filters = `${direction ? `&direction=${direction}` : ""}${status ? `&status=${status}` : ""}`;
      const res = await fetch(`${apiUrl}/v1/transfers?address=${address}&limit=50${cursor}${filters}`, { signal: AbortSignal.timeout(90_000) });
      if (!res.ok) throw new Error(`History service responded ${res.status}`);
      return res.json();
    },
  });
  // A transfer can move across a page boundary during a refresh. Display it only once.
  const indexed = [...new Map((remote.data?.pages.flatMap((p) => p.transfers) ?? []).map((t) => [t.transfer_id.toLowerCase(), t])).values()];
  const remoteLoading = !!address && apiConfigured && remote.isPending;
  const waking = useSlowLoad(remoteLoading);
  const remoteIds = new Set(indexed.map((t) => t.transfer_id.toLowerCase()));
  const onlyLocal = local.filter((t) => !status && (!direction || t.direction === direction) && !remoteIds.has(t.transferId.toLowerCase()));

  return (
    <>
      <PageTitle kicker="History" title="Every transfer, traceable to a transaction">
        Indexed from chain logs by the Reach indexer, plus anything started in this browser that isn&apos;t indexed yet. Each row opens a tracker that re-reads both chains.
      </PageTitle>
      <div className="space-y-6">
        {!deployed && <NotDeployedNotice />}
        {!connected ? (
          <ConnectPrompt what="see your transfer history" />
        ) : (
          <Panel className="p-2 sm:p-4">
            <div className="flex flex-wrap gap-3 p-3"><label className="text-xs text-ink-300">Route<select aria-label="Filter by route" value={direction} onChange={(e) => setDirection(e.target.value)} className="ml-3 h-10 rounded-sm border border-ink-600 bg-ink-950 px-2 text-sm"><option value="">All networks</option><option value="ISSUE">Mezo → Base</option><option value="REDEEM">Base → Mezo</option></select></label><label className="text-xs text-ink-300">Status<select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)} className="ml-3 h-10 max-w-full rounded-sm border border-ink-600 bg-ink-950 px-2 text-sm"><option value="">All statuses</option>{Object.entries(label).map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label></div>
            {!apiConfigured ? (
              <Notice tone="info" className="m-2">The history service is not configured for this build. Showing transfers started in this browser only.</Notice>
            ) : remote.isError ? (
              <Notice tone="pending" className="m-2">
                The history service did not respond ({(remote.error as Error).message}). On-chain actions still work; showing transfers started in this browser. It retries automatically.
              </Notice>
            ) : waking ? (
              <ApiWakingNotice className="m-2" />
            ) : null}
            {remoteLoading && onlyLocal.length === 0 ? (
              <p className="p-4 text-sm text-ink-300" aria-live="polite">Loading indexed transfers…</p>
            ) : indexed.length + onlyLocal.length === 0 ? (
              <div className="p-2">
                {!indexComplete && apiConfigured ? <Notice tone="pending" title="History coverage is not yet confirmed">The indexer may be catching up or its readiness check is unavailable. An empty response does not prove this address has no transfers. Saved tracker links can still be checked directly.</Notice> : <EmptyState title={direction || status ? "No transfers match these filters" : "No transfers for this address"}>No matching indexed transfers on the current deployment. Try a different filter or check a saved tracker link.</EmptyState>}
              </div>
            ) : (
              <div className="relative overflow-x-auto">
                <table className="w-full min-w-[40rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-ink-700">
                      {["Network route", "Type", "Amount", "Status", "Date (UTC)", "Origin tx", ""].map((h) => (
                        <th key={h} scope="col" className="px-3 py-3 font-mono text-[0.625rem] font-normal uppercase tracking-[0.12em] text-ink-400">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-750">
                    {indexed.map((t) => (
                      <tr key={t.transfer_id}>
                        <td className="px-3 py-3 text-bone-100">{t.direction === "ISSUE" ? "Mezo → Base" : "Base → Mezo"}</td>
                        <td className="px-3 py-3 text-ink-300">{t.direction === "ISSUE" ? "Lock / issue" : "Burn / redeem"}</td>
                        <td className="px-3 py-3">
                          <Amount value={BigInt(t.shares)} unit={t.direction === "ISSUE" ? "wSMUSD" : "rwSMUSD"} />
                        </td>
                        <td className="px-3 py-3">
                          <Chip tone={tone(t.status)}>{label[t.status] ?? t.status}</Chip>
                        </td>
                        <td className="px-3 py-3 text-xs text-ink-300">{t.origin_time ? new Date(t.origin_time).toISOString().replace("T", " ").slice(0, 19) : "Timestamp unavailable"}</td>
                        <td className="px-3 py-3">
                          <Hash value={t.origin_tx} href={(t.direction === "ISSUE" ? explorer.mezoTx : explorer.baseTx)(t.origin_tx)} />
                        </td>
                        <td className="px-3 py-3 text-right">
                          <Link href={`/app/transfers/${t.transfer_id}?tx=${t.origin_tx}&dir=${t.direction}&seq=${t.wormhole_sequence}`} className="inline-flex items-center gap-1 text-bone-100 hover:text-ember-400">
                            Track <Arrow />
                          </Link>
                        </td>
                      </tr>
                    ))}
                    {onlyLocal.map((t) => (
                      <tr key={t.transferId}>
                        <td className="px-3 py-3 text-bone-100">{t.direction === "ISSUE" ? "Mezo → Base" : "Base → Mezo"}</td>
                        <td className="px-3 py-3 text-ink-300">{t.direction === "ISSUE" ? "Lock / issue" : "Burn / redeem"}</td>
                        <td className="px-3 py-3">
                          <Amount value={BigInt(t.shares)} unit={t.direction === "ISSUE" ? "wSMUSD" : "rwSMUSD"} />
                        </td>
                        <td className="px-3 py-3">
                          <Chip tone="neutral">Not indexed yet</Chip>
                        </td>
                        <td className="px-3 py-3 text-xs text-ink-300">{new Date(t.createdAt).toISOString().replace("T", " ").slice(0, 19)} <span className="block text-ink-400">browser time</span></td>
                        <td className="px-3 py-3">
                          <Hash value={t.originTx} href={(t.direction === "ISSUE" ? explorer.mezoTx : explorer.baseTx)(t.originTx)} />
                        </td>
                        <td className="px-3 py-3 text-right">
                          <Link href={`/app/transfers/${t.transferId}?tx=${t.originTx}&dir=${t.direction}&seq=${t.sequence}`} className="inline-flex items-center gap-1 text-bone-100 hover:text-ember-400">
                            Track <Arrow />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {remote.hasNextPage && (
              <div className="p-3 text-center">
                <Button intent="secondary" busy={remote.isFetchingNextPage} onClick={() => remote.fetchNextPage()}>
                  {remote.isFetchNextPageError ? "Retry loading older transfers" : "Load older transfers"}
                </Button>
              </div>
            )}
          </Panel>
        )}
      </div>
    </>
  );
}
