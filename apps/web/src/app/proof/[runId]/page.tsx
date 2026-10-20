"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Hex } from "viem";
import { ContentPage } from "@/components/site/Page";
import { Arrow, Button, Chip, Hash, Notice, Panel } from "@/components/ui/primitives";
import { useClients } from "@/lib/hooks";
import { publicRuns, rehearsals, explorer, type EvidenceStep } from "@/lib/reach";
import { cn } from "@/lib/cn";

const fmt = (v: unknown): string => (typeof v === "object" && v !== null ? JSON.stringify(v, null, 2) : String(v));

function StepCard({ s, live, isPublic }: { s: EvidenceStep; live?: { ok: boolean; detail: string }; isPublic: boolean }) {
  const [open, setOpen] = useState(false);
  const txUrl = s.txHash && isPublic ? (s.chain === "base" ? explorer.baseTx(s.txHash) : explorer.mezoTx(s.txHash)) : undefined;
  const negative = s.title.startsWith("Negative");
  return (
    <li className="rounded-md border border-ink-700 bg-ink-900">
      <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-4">
          <span className="num shrink-0 text-sm text-ember-400">{s.id}</span>
          <div className="min-w-0">
            <p className="font-medium leading-snug text-bone-100">{s.title}</p>
            <p className="mt-1 text-xs text-ink-400">
              {s.chain === "offchain" ? "Off-chain / read-only" : s.chain === "base" ? "Base Sepolia" : "Mezo testnet"}
              {negative && " · read-only simulation against deployed contracts"}
            </p>
            {s.txHash && (
              <p className="mt-2 text-xs text-ink-300">
                tx <Hash value={s.txHash} href={txUrl} /> {s.blockNumber && <span className="num text-ink-400">block {s.blockNumber}</span>}
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Chip tone={s.status === "PASS" ? "verified" : "failed"}>{s.status}</Chip>
          {live && <Chip tone={live.ok ? "verified" : "failed"}>{live.ok ? "re-verified live" : "live check failed"}</Chip>}
        </div>
      </div>
      <div className="border-t border-ink-750 px-5 py-3">
        <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="text-xs text-ink-300 hover:text-bone-100">
          {open ? "Hide" : "Show"} recorded details
        </button>
        {open && (
          <dl className="mt-3 space-y-2">
            {Object.entries(s.details).map(([k, v]) => (
              <div key={k} className="grid gap-1 sm:grid-cols-[12rem_1fr]">
                <dt className="font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-ink-400">{k}</dt>
                <dd className="num break-hash whitespace-pre-wrap text-xs text-bone-200">{fmt(v)}</dd>
              </div>
            ))}
            {live && <p className="text-xs text-ink-400">live: {live.detail}</p>}
          </dl>
        )}
      </div>
    </li>
  );
}

export default function RunPage() {
  const { runId } = useParams<{ runId: string }>();
  const run = publicRuns.find((r) => r.runId === runId) ?? rehearsals.find((r) => r.runId === runId);
  const isPublic = run?.kind === "PUBLIC_TESTNET_RUN";
  const clients = useClients();
  const [checking, setChecking] = useState(false);

  const live = useQuery({
    queryKey: ["run-live", runId],
    enabled: checking && !!clients && !!run && isPublic,
    queryFn: async () => {
      const out: Record<string, { ok: boolean; detail: string }> = {};
      for (const s of run!.steps) {
        if (!s.txHash) continue;
        const c = s.chain === "base" ? clients!.base : clients!.mezo;
        try {
          const r = await c.getTransactionReceipt({ hash: s.txHash as Hex });
          out[s.id] = { ok: r.status === "success" && (!s.blockNumber || r.blockNumber.toString() === s.blockNumber), detail: `status ${r.status}, block ${r.blockNumber}` };
        } catch (e) {
          out[s.id] = { ok: false, detail: (e as Error).message.split("\n")[0]! };
        }
      }
      return out;
    },
  });

  if (!run)
    return (
      <ContentPage kicker="Proof" title="Run not found">
        <Link href="/proof" className="inline-flex items-center gap-2 text-bone-100 underline underline-offset-4">
          All runs <Arrow />
        </Link>
      </ContentPage>
    );

  const passed = run.steps.filter((s) => s.status === "PASS").length;
  return (
    <ContentPage kicker={isPublic ? "Public-testnet run" : "Local fork rehearsal"} title={<span className="num block break-all text-[clamp(1.1rem,0.6rem+2vw,2.25rem)] leading-tight">{run.runId}</span>} lede={<p>{run.disclaimer}</p>}>
      <div className="space-y-6">
        {!isPublic && (
          <Notice tone="pending" title="Not public evidence">
            These transactions were executed on local forks and cannot be found on Mezo or Base explorers. Explorer links are intentionally omitted.
          </Notice>
        )}
        {isPublic && (
          <Notice tone="info" title="Contract version exercised">
            This run used the first public deployment (settlement model <span className="num">{String(run.deployment.settlementModel ?? "fallback-v1")}</span>). Its MUSD-mode redemptions fall back to wSMUSD shares on any settlement failure; a fixed version is implemented and tested locally but has not been deployed or run publicly yet.
          </Notice>
        )}
        {run.reusedTransactions && (
          <Notice tone="pending" title="How this record was assembled">
            <p>{run.reusedTransactions.note}</p>
            <ul className="mt-2 space-y-1">
              {Object.entries(run.reusedTransactions)
                .filter(([k]) => k !== "note")
                .map(([k, v]) => (
                  <li key={k} className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="num text-ink-300">{k}</span>
                    <Hash value={v} />
                  </li>
                ))}
            </ul>
          </Notice>
        )}
        <Panel className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <span className="text-ink-300">
              Steps <span className="num text-bone-100">{passed}/{run.steps.length}</span> pass
            </span>
            <span className="text-ink-300">
              Amount <span className="num text-bone-100">{run.amountMusd} MUSD</span>
            </span>
            <span className="text-ink-300">
              Started <span className="num text-bone-100">{new Date(run.startedAt).toISOString().replace("T", " ").slice(0, 19)} UTC</span>
            </span>
          </div>
          {isPublic && (
            <Button intent="secondary" onClick={() => setChecking(true)} busy={live.isFetching}>
              Re-verify every transaction live
            </Button>
          )}
        </Panel>
        <ol className={cn("space-y-3")}>
          {run.steps.map((s) => (
            <StepCard key={s.id} s={s} live={live.data?.[s.id]} isPublic={isPublic} />
          ))}
        </ol>
        <p className="text-sm text-ink-400">
          Independent check from a clean checkout: <code className="num rounded-xs bg-ink-850 px-1.5 py-0.5 text-bone-200">pnpm verify evidence evidence/{isPublic ? "real-chain" : "fork-rehearsal"}/{run.runId}.json</code> re-reads each receipt and re-verifies each VAA through the live Wormhole Core.
        </p>
      </div>
    </ContentPage>
  );
}
