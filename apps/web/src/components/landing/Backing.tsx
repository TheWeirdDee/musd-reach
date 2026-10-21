"use client";

import Link from "next/link";
import { formatAmount } from "@musd-reach/sdk";
import { Reveal, SectionHead } from "./Reveal";
import { Chip, Skeleton, Arrow } from "@/components/ui/primitives";
import { useNativeVault, useReconciliation, useWrapper } from "@/lib/hooks";
import { deployment, reachConfig } from "@/lib/reach";

function Stat({ label, children, sub }: { label: string; children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="bg-ink-900 p-5">
      <p className="kicker text-ink-400">{label}</p>
      <div className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-bone-50">{children}</div>
      {sub && <p className="mt-1.5 text-xs leading-relaxed text-ink-400">{sub}</p>}
    </div>
  );
}

export function Backing() {
  const vault = useNativeVault();
  const wrapper = useWrapper();
  const rec = useReconciliation();
  const r = rec.data;
  const total = r ? r.remoteSupply + r.pendingIssueShares + r.pendingRedemptionShares : 0n;
  const pct = (x: bigint) => (total === 0n ? 0 : Number((x * 10_000n) / total) / 100);

  return (
    <Reveal as="section" className="py-24 sm:py-32">
      <div className="shell">
        <SectionHead
          index="05"
          kicker="Backing and conservation"
          title={
            <>
              Check the backing <span className="font-serif font-normal italic text-ember-400">yourself.</span>
            </>
          }
          lede={
            <p>
              These figures are read live from both chains in your browser, not from our server. Base is read first, then Mezo; a burn cannot be attested and released in the seconds between the two reads, so the equation must balance exactly. A mismatch is shown, never smoothed over.
            </p>
          }
        />

        <div data-reveal className="mt-14 rounded-md border border-ink-700 bg-ink-900 p-6 sm:p-8">
          <p className="num break-words text-[clamp(0.9rem,0.7rem+0.9vw,1.375rem)] leading-relaxed text-bone-100">
            locked <span className="text-ember-300">wSMUSD</span> <span className="text-ink-400">=</span> <span className="text-sage-300">rwSMUSD supply</span> <span className="text-ink-400">+</span> <span className="text-sand-300">in-flight issues</span> <span className="text-ink-400">+</span> <span className="text-sand-300">in-flight redemptions</span>
          </p>

          {!deployment ? (
            <div className="mt-8 flex flex-col gap-3 border-t border-ink-700 pt-6 sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-2xl text-sm leading-relaxed text-ink-300">
                Reach contracts are not deployed on public testnets yet, so there is nothing to reconcile. Every term above is 0 by definition; we don&apos;t display numbers until real contracts hold real shares.
              </p>
              <Chip tone="pending">Awaiting deployment</Chip>
            </div>
          ) : rec.isLoading ? (
            <div className="mt-8 grid gap-3 sm:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : rec.isError || !r ? (
            <p className="mt-8 text-sm text-rust-300">Could not read both chains right now ({String((rec.error as Error)?.message ?? "unknown error").split("\n")[0]}). Nothing is shown rather than a stale figure.</p>
          ) : (
            <div className="mt-8 space-y-6 border-t border-ink-700 pt-6">
              <div className="flex flex-wrap items-center gap-3">
                <Chip tone={r.status === "BALANCED" ? "verified" : "failed"}>{r.status === "BALANCED" ? "Balanced" : "Mismatch"}</Chip>
                <span className="num text-xs text-ink-400">
                  Mezo block {r.mezoBlock.toString()} · Base block {r.baseBlock.toString()}
                </span>
              </div>
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-ink-800" role="img" aria-label="Composition of locked shares">
                <span className="h-full bg-sage-400" style={{ width: `${pct(r.remoteSupply)}%` }} />
                <span className="h-full bg-sand-400" style={{ width: `${pct(r.pendingIssueShares)}%` }} />
                <span className="h-full bg-sand-500" style={{ width: `${pct(r.pendingRedemptionShares)}%` }} />
              </div>
              <div className="grid gap-px overflow-hidden rounded-sm border border-ink-700 bg-ink-700 sm:grid-cols-2 lg:grid-cols-4">
                <Stat label="Locked wSMUSD">{formatAmount(r.totalLocked, 18, 4)}</Stat>
                <Stat label="rwSMUSD supply">{formatAmount(r.remoteSupply, 18, 4)}</Stat>
                <Stat label="In-flight issues" sub={`${r.pendingIssues.length} transfer(s)`}>{formatAmount(r.pendingIssueShares, 18, 4)}</Stat>
                <Stat label="In-flight redemptions" sub={`${r.pendingRedemptions.length} transfer(s)`}>{formatAmount(r.pendingRedemptionShares, 18, 4)}</Stat>
              </div>
            </div>
          )}
        </div>

        <div data-reveal className="mt-6 grid gap-px overflow-hidden rounded-md border border-ink-700 bg-ink-700 md:grid-cols-3">
          <Stat label="Native vault implementation" sub="EIP-1967 slot read live; Reach fails closed if it changes">
            {vault.data ? (
              <span className="flex items-center gap-2 text-base">
                <Chip tone={vault.data.implementationMatchesRegistry ? "verified" : "failed"}>{vault.data.implementationMatchesRegistry ? "Matches pinned" : "Changed"}</Chip>
              </span>
            ) : vault.isError ? (
              <span className="text-sm text-rust-300">Unavailable</span>
            ) : (
              <Skeleton className="h-6 w-28" />
            )}
          </Stat>
          <Stat label="sMUSD in the native vault" sub={vault.data ? `all holders, Mezo block ${vault.data.blockNumber}` : "all holders, live"}>
            {vault.data ? <span className="num">{formatAmount(vault.data.totalSupply, 18, 0)}</span> : vault.isError ? <span className="text-sm text-rust-300">Unavailable</span> : <Skeleton className="h-6 w-36" />}
          </Stat>
          <Stat label="Wrapper NAV per wSMUSD" sub={deployment ? "MUSD per share, rounded down" : "appears after deployment"}>
            {!deployment ? <span className="text-base text-ink-400">—</span> : wrapper.data ? <span className="num">{formatAmount(wrapper.data.assetsPerShare, 18, 6)}</span> : <Skeleton className="h-6 w-24" />}
          </Stat>
        </div>
        <p data-reveal className="mt-6 text-sm text-ink-400">
          Prefer a terminal? <code className="num rounded-xs bg-ink-850 px-1.5 py-0.5 text-bone-200">pnpm verify all</code> runs the same checks from a clean checkout against {reachConfig.mezo.rpcUrls[0]} and {reachConfig.base.rpcUrls[0]}.{" "}
          <Link href="/developers#verify" className="inline-flex items-center gap-1 text-bone-100 underline decoration-ink-600 underline-offset-4 hover:text-ember-400">
            Verifier docs <Arrow />
          </Link>
        </p>
      </div>
    </Reveal>
  );
}
