"use client";

import Link from "next/link";
import { Amount, Arrow, Chip, EmptyState, Notice, Panel, Hash, type Tone } from "@/components/ui/primitives";
import { PageTitle, NotDeployedNotice, ConnectPrompt, useGate } from "@/components/app/AppKit";
import { apiConfigured, useApi, useSlowLoad } from "@/lib/hooks";
import { ApiWakingNotice } from "@/components/app/ApiWaking";
import { useLocalTransfers } from "@/lib/pending";
import { explorer } from "@/lib/reach";

type Row = { transfer_id: string; direction: "ISSUE" | "REDEEM"; status: string; shares: string; origin_tx: string; origin_block: number; recipient: string; wormhole_sequence: string; musd_out: string | null };

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
  const remote = useApi<{ transfers: Row[] }>(deployed && address ? `/v1/transfers?address=${address}&limit=50` : null, { refetchInterval: 20_000 });
  const remoteLoading = !!address && apiConfigured && remote.isPending;
  const waking = useSlowLoad(remoteLoading);
  const remoteIds = new Set((remote.data?.transfers ?? []).map((t) => t.transfer_id.toLowerCase()));
  const onlyLocal = local.filter((t) => !remoteIds.has(t.transferId.toLowerCase()));

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
            ) : (remote.data?.transfers.length ?? 0) + onlyLocal.length === 0 ? (
              <div className="p-2">
                <EmptyState title="No transfers for this address">Nothing has been locked or burned from this wallet on the current deployment.</EmptyState>
              </div>
            ) : (
              <div className="relative overflow-x-auto">
                <table className="w-full min-w-[40rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-ink-700">
                      {["Direction", "Amount", "Status", "Origin tx", ""].map((h) => (
                        <th key={h} scope="col" className="px-3 py-3 font-mono text-[0.625rem] font-normal uppercase tracking-[0.12em] text-ink-400">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-750">
                    {(remote.data?.transfers ?? []).map((t) => (
                      <tr key={t.transfer_id}>
                        <td className="px-3 py-3 text-bone-100">{t.direction === "ISSUE" ? "Mezo → Base" : "Base → Mezo"}</td>
                        <td className="px-3 py-3">
                          <Amount value={BigInt(t.shares)} unit={t.direction === "ISSUE" ? "wSMUSD" : "rwSMUSD"} />
                        </td>
                        <td className="px-3 py-3">
                          <Chip tone={tone(t.status)}>{label[t.status] ?? t.status}</Chip>
                        </td>
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
                        <td className="px-3 py-3">
                          <Amount value={BigInt(t.shares)} unit={t.direction === "ISSUE" ? "wSMUSD" : "rwSMUSD"} />
                        </td>
                        <td className="px-3 py-3">
                          <Chip tone="neutral">Not indexed yet</Chip>
                        </td>
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
          </Panel>
        )}
      </div>
    </>
  );
}
