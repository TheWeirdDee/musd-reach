"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import { Chip, Skeleton } from "@/components/ui/primitives";
import { H2 } from "@/components/site/Page";
import { cn } from "@/lib/cn";
import { LEGS, STAMPS, ROUTE_STAMPS, readPassports, type Passport, type PassportBoard } from "@/lib/passport";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function usePassports() {
  return useQuery<PassportBoard>({ queryKey: ["passports"], queryFn: readPassports, staleTime: 60_000, refetchInterval: 90_000, retry: 1 });
}

/** One wallet's passport: the route Mezo → Base → Mezo, with a stamp for every leg it has travelled. */
export function PassportCard({ address, mine }: { address: Address; mine?: boolean }) {
  const board = usePassports();
  const [copied, setCopied] = useState(false);
  const p: Passport | undefined = board.data?.wallets.find((x) => x.address.toLowerCase() === address.toLowerCase());
  const done = new Set(p?.done ?? []);
  const route = (p?.done ?? []).filter((id) => id !== "bug").length;
  const place = board.data && p && !p.team ? board.data.wallets.filter((x) => !x.team).findIndex((x) => x.address === p.address) + 1 : null;
  const legs = LEGS.filter((l) => l.id !== "inspector");
  return (
    <section className="rounded-md border border-ink-700 bg-ink-900/60 p-5 sm:p-6" aria-label="Route passport">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="kicker text-ink-400">
            {mine ? "Your route passport" : "Route passport"} · <span className="num">{short(address)}</span>
            {p?.team && " · team wallet"}
          </p>
          <p className="mt-2 text-[2rem] font-semibold leading-tight tracking-[-0.03em] text-bone-50">
            {board.isPending ? <Skeleton className="inline-block h-9 w-48" /> : p?.stage.label ?? "Not on the route yet"}
          </p>
          <p className="mt-1 text-sm text-ink-200">
            <span className="num">{route}</span> of {ROUTE_STAMPS} route stamps{done.has("bug") ? " · route inspector" : ""}
            {place ? ` · #${place} on the route board` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(`${window.location.origin}/passport/${address}`).then(() => setCopied(true), () => {});
            setTimeout(() => setCopied(false), 2_000);
          }}
          className="rounded-sm border border-ink-600 px-3 py-2 text-sm text-bone-100 hover:border-ink-400"
        >
          {copied ? "Link copied" : "Copy passport link"}
        </button>
      </div>

      <ol className="mt-6 grid items-stretch gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr]">
        {legs.map((leg, i) => (
          <Fragment key={leg.id}>
            <li className="rounded-md border border-ink-700 bg-ink-950/50 p-4">
              <p className="font-mono text-[0.625rem] uppercase tracking-[0.14em] text-ember-400">{leg.n} · {leg.where}</p>
              <p className="mt-1 font-semibold text-bone-50">{leg.name}</p>
              <ul className="mt-3 space-y-2">
                {STAMPS.filter((s) => s.leg === leg.id).map((s) => {
                  const ok = done.has(s.id);
                  return (
                    <li key={s.id} className="flex items-center gap-3 text-sm">
                      <span aria-hidden className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs", ok ? "border-ember-500 bg-ember-500/15 text-ember-300" : "border-dashed border-ink-600 text-ink-600")}>{ok ? "✓" : ""}</span>
                      <span className={ok ? "text-bone-50" : "text-ink-400"}>{s.title}</span>
                      <span className="sr-only">{ok ? "stamped" : "not yet"}</span>
                    </li>
                  );
                })}
              </ul>
            </li>
            {i < legs.length - 1 && (
              <li aria-hidden className="hidden items-center justify-center text-ink-500 lg:flex">
                →
              </li>
            )}
          </Fragment>
        ))}
      </ol>
    </section>
  );
}

/** Every stamp, by leg, with how to earn it and what proves it on chain. */
export function StampList({ address }: { address?: Address }) {
  const board = usePassports();
  const p = address ? board.data?.wallets.find((x) => x.address.toLowerCase() === address.toLowerCase()) : undefined;
  return (
    <div className="space-y-8">
      {LEGS.map((leg) => (
        <section key={leg.id}>
          <p className="font-mono text-[0.625rem] uppercase tracking-[0.14em] text-ember-400">{leg.n} · {leg.where}</p>
          <H2>{leg.name}</H2>
          <ol className="mt-4 grid gap-3 md:grid-cols-2">
            {STAMPS.filter((s) => s.leg === leg.id).map((s) => {
              const ok = !!p?.done.includes(s.id);
              const external = s.href.startsWith("http");
              return (
                <li key={s.id} className={cn("rounded-md border p-4", ok ? "border-ember-500/40 bg-ember-500/[0.04]" : "border-ink-700 bg-ink-900/40")}>
                  <p className="font-semibold tracking-[-0.01em] text-bone-50">{s.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-ink-300">{s.how}</p>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    {ok ? <Chip tone="accent">Stamped</Chip> : external ? <a className="text-sm underline underline-offset-4" href={s.href} target="_blank" rel="noreferrer">Open an issue ↗</a> : <Link className="text-sm underline underline-offset-4" href={s.href}>Go →</Link>}
                    <span className="text-[0.6875rem] text-ink-500">Proof: {s.proof}</span>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}

/** Who has travelled furthest along the route. Team wallets are left off. */
export function RouteBoard() {
  const board = usePassports();
  const rows = (board.data?.wallets ?? []).filter((w) => !w.team).slice(0, 50);
  const team = (board.data?.wallets ?? []).filter((w) => w.team).length;
  return (
    <section aria-labelledby="route-board">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <H2 id="route-board">Route board</H2>
        <p className="text-xs text-ink-400">{board.data ? `Updated ${new Date(board.data.asOf).toLocaleTimeString()}, from chain events. ${team} team wallet${team === 1 ? "" : "s"} left off.` : "Reading chain events…"}</p>
      </div>
      {board.data?.failed.length ? <p className="mt-2 text-xs text-sand-300">Some stamps could not be read just now ({board.data.failed.join(", ")}); they will appear on the next refresh.</p> : null}
      <div className="mt-4 overflow-x-auto rounded-md border border-ink-700">
        <table className="w-full min-w-[32rem] text-left text-sm">
          <thead>
            <tr className="border-b border-ink-700 font-mono text-[0.625rem] uppercase tracking-[0.12em] text-ink-400">
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Wallet</th>
              <th className="px-4 py-3">Furthest leg</th>
              <th className="px-4 py-3 text-right">Route stamps</th>
            </tr>
          </thead>
          <tbody>
            {board.isPending && (
              <tr>
                <td colSpan={4} className="px-4 py-6"><Skeleton className="h-5 w-full" /></td>
              </tr>
            )}
            {board.data && rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-ink-300">No travellers yet. Be the first: <Link className="underline underline-offset-4" href="/start">get your route kit</Link>.</td>
              </tr>
            )}
            {rows.map((w, i) => (
              <tr key={w.address} className="border-b border-ink-800 last:border-b-0">
                <td className="num px-4 py-3 text-ink-400">{i + 1}</td>
                <td className="px-4 py-3"><Link className="num underline-offset-4 hover:underline" href={`/passport/${w.address}`}>{short(w.address)}</Link>{w.done.includes("bug") && <span className="ml-2 text-xs text-ember-400">inspector</span>}</td>
                <td className="px-4 py-3 text-ink-200">{w.stage.label}</td>
                <td className="num px-4 py-3 text-right font-medium text-bone-50">{w.done.filter((id) => id !== "bug").length} / {ROUTE_STAMPS}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
