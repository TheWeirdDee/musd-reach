"use client";

import Link from "next/link";
import { useState } from "react";
import { useAccount } from "wagmi";
import type { Address } from "viem";
import { ContentPage } from "@/components/site/Page";
import { Button, Chip } from "@/components/ui/primitives";
import { useClients } from "@/lib/hooks";
import { explainError, errorCode } from "@/lib/errors";
import { ATTACKS, PARTS, STRANGER, type Attack } from "@/lib/attacks";
import { MEZO_ID } from "@/lib/reach";
import { cn } from "@/lib/cn";

type Outcome = { state: "idle" | "running" | "refused" | "went-through" | "unavailable"; reason?: string; code?: string };

export default function AttackPage() {
  const clients = useClients();
  const { address } = useAccount();
  const [fromWallet, setFromWallet] = useState(false);
  const [out, setOut] = useState<Record<string, Outcome>>({});
  const from: Address = fromWallet && address ? address : STRANGER;
  const running = Object.values(out).some((o) => o.state === "running");

  async function run(a: Attack) {
    if (!clients) return;
    setOut((o) => ({ ...o, [a.id]: { state: "running" } }));
    let call;
    try {
      call = await a.build(from);
    } catch {
      call = null;
    }
    if (!call) {
      setOut((o) => ({ ...o, [a.id]: { state: "unavailable", reason: "Could not prepare this attack right now (a public service did not answer). Try again." } }));
      return;
    }
    const client = call.chainId === MEZO_ID ? clients.mezo : clients.base;
    try {
      await client.simulateContract({ ...call, account: from } as never);
      setOut((o) => ({ ...o, [a.id]: { state: "went-through", reason: "The contract accepted this call. Please report it." } }));
    } catch (e) {
      const { message } = explainError(e);
      const network = /network is busy|node is behind/i.test(message);
      setOut((o) => ({ ...o, [a.id]: network ? { state: "unavailable", reason: message } : { state: "refused", reason: message, code: errorCode(e) } }));
    }
  }

  // Display order: along the route, Mezo → message → Base.
  const ordered = PARTS.flatMap((p) => ATTACKS.filter((a) => a.part === p.id));

  async function runAll() {
    for (const a of ordered) await run(a);
  }

  const refused = ATTACKS.filter((a) => out[a.id]?.state === "refused").length;

  return (
    <ContentPage
      kicker="Attack the bridge"
      title={<>A claim on Mezo savings is only worth something if nobody can fake it. <span className="font-serif font-normal italic text-ember-400">Try.</span></>}
      lede={
        <p>
          Reach moves a claim on savings from Mezo to Base and back. These are {ATTACKS.length} real attacks on that route, against the live testnet contracts: on the savings locked on Mezo, on the Wormhole message in between, and on the receipt and markets on Base. Each one is simulated on the chain, so nothing is sent, signed or spent. They run as a stranger with no rights ({STRANGER.slice(0, 6)}…{STRANGER.slice(-4)}), or from your own wallet. Find one that goes through? <a className="underline underline-offset-4" href="https://github.com/TheWeirdDee/musd-reach/issues/new" target="_blank" rel="noreferrer">Report it</a> and earn the <Link className="underline underline-offset-4" href="/passport">route inspector stamp</Link>.
        </p>
      }
    >
      <div className="mb-8 flex flex-wrap items-center gap-3">
        <Button busy={running} disabled={running || !clients} onClick={runAll}>
          Run all {ATTACKS.length}
        </Button>
        <div className="flex gap-1 rounded-sm border border-ink-700 p-1" role="radiogroup" aria-label="Run as">
          {[
            { v: false, label: "As a stranger" },
            { v: true, label: address ? "From my wallet" : "From my wallet (connect first)" },
          ].map((o) => (
            <button key={o.label} type="button" role="radio" aria-checked={fromWallet === o.v} disabled={o.v && !address} onClick={() => setFromWallet(o.v)} className={cn("rounded-sm px-3 py-1.5 text-sm", fromWallet === o.v ? "bg-ink-700 text-bone-50" : "text-ink-300 disabled:opacity-50")}>
              {o.label}
            </button>
          ))}
        </div>
        {refused > 0 && <span className="text-sm text-sage-300" aria-live="polite">{refused} of {ATTACKS.length} refused by the contracts</span>}
      </div>
      <div className="space-y-10">
        {PARTS.map((part, pi) => (
          <section key={part.id} aria-labelledby={`part-${part.id}`}>
            <p className="font-mono text-[0.625rem] uppercase tracking-[0.14em] text-ember-400">{String(pi + 1).padStart(2, "0")} · {part.where}</p>
            <h2 id={`part-${part.id}`} className="mt-1 text-xl font-semibold tracking-[-0.02em] text-bone-50">{part.name}</h2>
            <p className="mt-1 max-w-3xl text-sm text-ink-300">{part.claim}</p>
          <ol className="mt-4 grid gap-4 md:grid-cols-2">
        {ATTACKS.filter((a) => a.part === part.id).map((a) => {
          const i = ordered.indexOf(a);
          const o = out[a.id] ?? { state: "idle" };
          return (
            <li key={a.id} className={cn("flex flex-col rounded-md border p-5", o.state === "refused" ? "border-sage-500/40 bg-sage-500/[0.04]" : o.state === "went-through" ? "border-rust-500/60 bg-rust-500/[0.06]" : "border-ink-700 bg-ink-900/40")}>
              <div className="flex items-start justify-between gap-3">
                <p className="font-semibold tracking-[-0.01em] text-bone-50">
                  <span className="num mr-2 text-sm text-ember-400">{String(i + 1).padStart(2, "0")}</span>
                  {a.title}
                </p>
                {o.state === "refused" && <Chip tone="verified">Refused</Chip>}
                {o.state === "went-through" && <Chip tone="failed">Went through</Chip>}
                {o.state === "unavailable" && <Chip tone="pending">Couldn&apos;t run</Chip>}
              </div>
              <p className="mt-2 text-sm leading-relaxed text-ink-200"><span className="text-ink-400">The attack: </span>{a.attempt}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-200"><span className="text-ink-400">The rule: </span>{a.rule}</p>
              {o.reason && (
                <p className={cn("mt-3 rounded-sm border px-3 py-2 text-sm", o.state === "refused" ? "border-sage-500/30 text-sage-200" : o.state === "went-through" ? "border-rust-500/50 text-rust-200" : "border-ink-600 text-ink-200")} aria-live="polite">
                  {o.reason}
                  {o.code && <span className="mt-1 block font-mono text-[0.6875rem] text-ink-400">Contract error: {o.code}</span>}
                </p>
              )}
              <div className="mt-auto pt-4">
                <Button intent="secondary" busy={o.state === "running"} disabled={running || !clients} onClick={() => run(a)}>
                  {o.state === "idle" ? "Run this attack" : "Run again"}
                </Button>
              </div>
            </li>
          );
        })}
          </ol>
          </section>
        ))}
      </div>
      <p className="mt-8 max-w-3xl text-xs leading-relaxed text-ink-500">
        How it works: each attack is sent to a public RPC as an eth_call (a simulation against current chain state), from {fromWallet ? "your wallet's address" : "a stranger's address"}. The chain answers whether the call would succeed. Nothing is signed or broadcast. The rules themselves are covered by the contract test suite and the threat model in the repository.
      </p>
    </ContentPage>
  );
}
