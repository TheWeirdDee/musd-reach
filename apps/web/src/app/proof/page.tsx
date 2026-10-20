"use client";

import Link from "next/link";
import { formatAmount } from "@musd-reach/sdk";
import { ContentPage, H2 } from "@/components/site/Page";
import { Arrow, Chip, EmptyState, Notice, Panel, Row, Skeleton } from "@/components/ui/primitives";
import { useReconciliation } from "@/lib/hooks";
import { publicRuns, rehearsals, deployment, type EvidenceRun } from "@/lib/reach";

function RunList({ runs, kind }: { runs: EvidenceRun[]; kind: "public" | "fork" }) {
  return (
    <ul className="divide-y divide-ink-750 rounded-md border border-ink-700 bg-ink-900">
      {runs
        .slice()
        .reverse()
        .map((r) => {
          const passed = r.steps.filter((s) => s.status === "PASS").length;
          return (
            <li key={r.runId}>
              <Link href={`/proof/${r.runId}`} className="flex flex-col gap-3 p-5 transition-colors hover:bg-ink-850 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="num break-hash text-sm text-bone-100">{r.runId}</p>
                  <p className="mt-1 text-xs text-ink-400">
                    {new Date(r.startedAt).toUTCString()} · {r.amountMusd} MUSD
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Chip tone={kind === "public" ? "verified" : "neutral"}>{kind === "public" ? "Public testnet" : "Local fork rehearsal"}</Chip>
                  <span className="num text-xs text-ink-300">
                    {passed}/{r.steps.length} steps pass
                  </span>
                  <Arrow className="text-ink-400" />
                </div>
              </Link>
            </li>
          );
        })}
    </ul>
  );
}

export default function ProofPage() {
  const rec = useReconciliation();
  return (
    <ContentPage
      kicker="Proof explorer"
      title="Recorded lifecycles and live backing"
      lede={
        <p>
          A recorded run proves one complete Reach lifecycle step by step, each with a transaction or a read-only negative test. Live backing below is read from both chains in your browser. Nothing on this page comes from a Reach server.
        </p>
      }
    >
      <div className="space-y-14">
        <section className="space-y-5" aria-labelledby="live">
          <H2 id="live">Live backing</H2>
          {!deployment ? (
            <EmptyState title="Nothing to reconcile yet">Reach contracts are not deployed on public testnets, so locked shares, remote supply and in-flight transfers are all zero by definition.</EmptyState>
          ) : rec.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : rec.isError || !rec.data ? (
            <Notice tone="failed">Could not read both chains: {String((rec.error as Error)?.message).split("\n")[0]}</Notice>
          ) : (
            <Panel className="p-6">
              <div className="flex flex-wrap items-center gap-3">
                <Chip tone={rec.data.status === "BALANCED" ? "verified" : "failed"}>{rec.data.status === "BALANCED" ? "Balanced" : "Mismatch"}</Chip>
                <span className="num text-xs text-ink-400">
                  Mezo {rec.data.mezoBlock.toString()} · Base finalized {rec.data.baseFinalizedBlock.toString()}
                </span>
              </div>
              <dl className="mt-4 grid gap-x-10 md:grid-cols-2">
                <Row label="Locked wSMUSD">{formatAmount(rec.data.totalLocked, 18, 6)}</Row>
                <Row label="rwSMUSD supply (finalized)">{formatAmount(rec.data.remoteSupply, 18, 6)}</Row>
                <Row label="In-flight issues">{formatAmount(rec.data.pendingIssueShares, 18, 6)}</Row>
                <Row label="In-flight redemptions">{formatAmount(rec.data.pendingRedemptionShares, 18, 6)}</Row>
              </dl>
              <ul className="mt-5 space-y-2 border-t border-ink-700 pt-5">
                {rec.data.checks.map((c) => (
                  <li key={c.name} className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-ink-200">{c.name}</span>
                    <Chip tone={c.ok ? "verified" : "failed"}>{c.ok ? "pass" : "fail"}</Chip>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </section>

        <section className="space-y-5" aria-labelledby="public">
          <H2 id="public">Public-testnet runs</H2>
          {publicRuns.length ? (
            <RunList runs={publicRuns} kind="public" />
          ) : (
            <EmptyState title="No public-testnet run recorded yet">
              The canonical run executes on Mezo testnet and Base Sepolia with real guardian-signed messages after deployment. Until it exists, this list stays empty. Older canonical-MUSD bridge transfers are a different protocol and are not substituted here.
            </EmptyState>
          )}
        </section>

        <section className="space-y-5" aria-labelledby="fork">
          <H2 id="fork">Local fork rehearsals</H2>
          <Notice tone="info">
            Rehearsals run the same lifecycle script against local Anvil forks of the live Mezo vault and real Wormhole Core contracts, with a guardian key substituted in fork storage and fork-only funding. Their transactions do not exist on public explorers. They show the code path works; they are not public evidence.
          </Notice>
          {rehearsals.length ? <RunList runs={rehearsals} kind="fork" /> : <EmptyState title="No rehearsals recorded" />}
        </section>
      </div>
    </ContentPage>
  );
}
