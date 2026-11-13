"use client";

import Link from "next/link";
import { Chip, EmptyState, Hash, Notice, Panel, Skeleton } from "@/components/ui/primitives";
import { H2 } from "@/components/site/Page";
import { explorer } from "@/lib/reach";
import { markets, marketDefs, marketRuns, useMarketActivity, type MarketRun } from "@/lib/markets";

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="border-t border-ink-700 pt-3">
      <p className="kicker text-ink-400">{label}</p>
      <p className="num mt-1 text-2xl text-bone-50">{value}</p>
    </div>
  );
}

/** Live adoption of the Base Sepolia market plus the recorded market proof runs. */
export function MarketProof() {
  const act = useMarketActivity();
  if (!markets) return null;
  // Latest recorded run for each loan asset (runs before the MUSD market are USDC runs).
  const latest = new Map<string, MarketRun>();
  for (const r of marketRuns) latest.set(r.loanAsset ?? "USDC", r);
  const runs = [...latest.entries()].sort(([a], [b]) => (a === "MUSD" ? -1 : b === "MUSD" ? 1 : 0));
  return (
    <section className="space-y-5" aria-labelledby="market">
      <H2 id="market">Live markets on Base Sepolia</H2>
      <Panel className="p-6">
        <div className="flex flex-wrap items-center gap-3">
          {marketDefs.map((d) => <Chip key={d.asset} tone="verified">Morpho Blue · rwSMUSD / {d.asset}</Chip>)}
          <span className="text-xs text-ink-400">Counted from vault and Morpho logs since block {String(markets.deployBlock)}, in your browser.</span>
        </div>
        {act.isError ? (
          <Notice className="mt-4" tone="failed">Could not read market logs: {(act.error as Error).message.split("\n")[0]}</Notice>
        ) : !act.data ? (
          <Skeleton className="mt-5 h-20 w-full" />
        ) : (
          <>
            <div className="mt-5 grid grid-cols-2 gap-6 sm:grid-cols-5">
              <Stat label="Unique wallets" value={act.data.wallets.length} />
              <Stat label="Lenders" value={act.data.lenders.length} />
              <Stat label="Borrowers" value={act.data.borrowers.length} />
              <Stat label="Deposits" value={act.data.deposits} />
              <Stat label="Borrows / repays" value={`${act.data.borrows} / ${act.data.repays}`} />
            </div>
            {act.data.wallets.length > 0 && (
              <details className="mt-5 border-t border-ink-700 pt-4">
                <summary className="cursor-pointer text-sm text-ink-200">Every participating wallet</summary>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {act.data.wallets.map((w) => (
                    <li key={w} className="flex items-center gap-2 text-xs text-ink-300">
                      <Hash value={w} href={explorer.baseAddress(w)} />
                      {act.data.lenders.includes(w) && <Chip tone="neutral">lender</Chip>}
                      {act.data.borrowers.includes(w) && <Chip tone="neutral">borrower</Chip>}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
        <p className="mt-5 text-sm text-ink-300">
          Want to be on this list? <Link className="text-bone-100 underline underline-offset-4" href="/start">Try it in ten minutes</Link>.
        </p>
      </Panel>
      {runs.length ? runs.map(([asset, run]) => (
        <Panel key={asset} className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-semibold tracking-[-0.02em] text-bone-50">{asset === "MUSD" ? "Recorded MUSD loop: save, borrow MUSD, bring it home, save again" : "Recorded USDC market run"}</h3>
            <span className="num text-xs text-ink-400">{run.runId}</span>
          </div>
          <ol className="mt-4 divide-y divide-ink-750">
            {run.steps.map((s) => (
              <li key={s.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="flex gap-3 text-sm text-ink-200">
                  <span className="num text-ember-400">{s.id}</span>
                  {s.title}
                </span>
                <span className="flex items-center gap-3">
                  {s.txHash && <Hash value={s.txHash} href={s.explorer} />}
                  <Chip tone={s.status === "PASS" ? "verified" : "failed"}>{s.status}</Chip>
                </span>
              </li>
            ))}
          </ol>
        </Panel>
      )) : (
        <EmptyState title="Market run pending">The recorded run (save on Mezo → borrow on Base) appears here once executed.</EmptyState>
      )}
    </section>
  );
}
