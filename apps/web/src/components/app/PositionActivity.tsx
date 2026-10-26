"use client";
import Link from "next/link";
import { useApi, apiConfigured, useClients } from "@/lib/hooks";
import { useQuery } from "@tanstack/react-query";
import { reachSourceGatewayAbi } from "@musd-reach/sdk";
import { reachConfig } from "@/lib/reach";
import { Amount, Chip, Notice, Panel } from "@/components/ui/primitives";
import type { Hex } from "viem";
type Transfer = { transfer_id: Hex; direction: "ISSUE" | "REDEEM"; status: string; shares: string; origin_tx: string; recipient: string };
const complete = new Set(["BACKED_REMOTE", "SHARES_RELEASED", "NATIVE_REDEEMED", "SHARES_CLAIMED_BY_RECIPIENT"]);
export function PositionActivity({ account }: { account: string }) {
  const api = useApi<{ transfers: Transfer[] }>(`/v1/transfers?address=${account}&limit=50`, { refetchInterval: 20_000 });
  const clients = useClients();
  const candidates = api.data?.transfers.filter((t) => t.direction === "REDEEM" && t.recipient.toLowerCase() === account.toLowerCase()) ?? [];
  const ids = candidates.map((t) => t.transfer_id);
  const settlements = useQuery({ queryKey: ["portfolio-settlements", account, ids], enabled: !!clients && !!reachConfig.deployment && ids.length > 0, refetchInterval: 15_000, queryFn: async () => Promise.all(ids.map(async (id) => { const [recipient, shares] = await clients!.mezo.readContract({ address: reachConfig.deployment!.sourceGateway, abi: reachSourceGatewayAbi, functionName: "pendingSettlements", args: [id] }); return { id, recipient, shares }; })) });
  const pending = settlements.data?.filter((s) => s.shares > 0n) ?? [];
  const active = api.data?.transfers.filter((t) => !complete.has(t.status)) ?? [];
  return <Panel className="p-6"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Transfers & recovery</h2><Link className="text-sm text-ink-300 underline underline-offset-4" href="/app/history">Full history →</Link></div><p className="mt-2 text-xs leading-6 text-ink-400">Latest 50 indexed transfers for this address. Pending payouts to you are checked on Mezo. Older activity is available in History.</p>{!apiConfigured ? <Notice className="mt-4" tone="info">History is not configured. Open a saved tracker URL to inspect a particular transfer.</Notice> : api.isPending ? <p className="mt-5 text-sm text-ink-300">Loading indexed activity; the service may be waking…</p> : api.isError ? <Notice className="mt-4" tone="pending">History is unavailable. This does not change your on-chain balances or block a direct recovery call.</Notice> : <><div className="mt-5 flex flex-wrap gap-3"><Chip tone={active.length ? "pending" : "neutral"}>{active.length} indexed transfers in progress</Chip><Chip tone={pending.length ? "pending" : "neutral"}>{settlements.isError ? "Recovery read unavailable" : ids.length && !settlements.isSuccess ? "Checking settlements" : `${pending.length} pending payouts found`}</Chip></div><ul className="mt-4 divide-y divide-ink-700">{active.slice(0, 6).map((t) => <li className="flex flex-wrap items-center justify-between gap-3 py-4" key={t.transfer_id}><div><p className="text-sm">{t.direction === "ISSUE" ? "Mezo → Base" : "Base → Mezo"} · <Amount value={BigInt(t.shares)} unit="shares" /></p><p className="mt-1 text-xs text-ink-300">{t.status.replaceAll("_", " ").toLowerCase()}</p></div><Link className="text-sm text-ember-300 underline underline-offset-4" href={`/app/transfers/${t.transfer_id}?tx=${t.origin_tx}&dir=${t.direction}`}>Track / recover →</Link></li>)}</ul>{!active.length && <p className="mt-5 text-sm text-ink-300">No in-progress transfers in the indexed page. This is an observation of history, not a prediction about future messages.</p>}</>}</Panel>;
}
