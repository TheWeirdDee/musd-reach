"use client";

import Link from "next/link";
import { useState } from "react";
import { integrations } from "@musd-reach/sdk";
import { Reveal, SectionHead } from "./Reveal";
import { Arrow, ButtonLink, Chip } from "@/components/ui/primitives";
import { statusLabel, statusTone } from "@/lib/status";
import { settlementCopy } from "@/lib/settlement";
import { publicRuns, rehearsals, deployment } from "@/lib/reach";
import { cn } from "@/lib/cn";

export function IntegrationStatus() {
  return (
    <Reveal as="section" className="py-24 sm:py-32">
      <div className="shell">
        <SectionHead
          index="07"
          kicker="Current integration status"
          title={
            <>
              No borrow button <span className="font-serif font-normal italic text-ember-400">until it&apos;s real.</span>
            </>
          }
          lede={
            <p>
              Morpho Blue on Base is the target receiving market. We proved technical compatibility on a fork of Base mainnet. No market, lender, curator or borrower exists yet, so borrowing through Reach is not available.
            </p>
          }
        />
        <ul className="mt-14 divide-y divide-ink-700 border-y border-ink-700">
          {integrations.map((i) => (
            <li key={i.id} data-reveal className="grid gap-3 py-6 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)_auto] md:items-start md:gap-8">
              <div>
                <p className="font-semibold tracking-[-0.01em] text-bone-50">{i.name}</p>
                <p className="mt-1 text-sm text-ink-400">{i.network}</p>
              </div>
              <p className="max-w-3xl text-[0.9375rem] leading-relaxed text-ink-300">{i.detail}</p>
              <div className="md:text-right">
                <Chip tone={statusTone[i.status] ?? "neutral"}>{statusLabel[i.status] ?? i.status}</Chip>
              </div>
            </li>
          ))}
        </ul>
        <Link href="/integrations" data-reveal className="mt-8 inline-flex items-center gap-2 border-b border-ink-500 pb-0.5 text-[0.9375rem] text-bone-100 hover:border-ember-500">
          Blockers and evidence for each integration <Arrow />
        </Link>
      </div>
    </Reveal>
  );
}

export function ProofTeaser() {
  return (
    <Reveal as="section" className="relative overflow-hidden border-y border-ink-700 bg-ink-900 py-24 sm:py-32">
      <div className="shell grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:items-center">
        <div data-reveal>
          <p className="kicker flex items-center gap-3 text-ink-300">
            <span className="text-ember-400">08</span>
            <span aria-hidden className="h-px w-6 bg-ink-600" />
            Proof explorer
          </p>
          <h2 className="mt-5 text-[length:var(--text-headline)] font-semibold leading-[var(--text-headline--line-height)] tracking-[var(--text-headline--letter-spacing)] text-bone-50">
            Every claim links to <span className="font-serif font-normal italic text-ember-400">a transaction.</span>
          </h2>
          <p className="mt-6 max-w-lg text-[1.0625rem] leading-relaxed text-ink-200">
            The proof explorer shows each recorded lifecycle step by step: deposit, lock, signed message, mint, transfer, burn, release, redemption, and the negative tests. Public-testnet runs and local fork rehearsals are labelled and never mixed.
          </p>
          <div className="mt-8">
            <ButtonLink href="/proof" intent="secondary">
              Open the proof explorer <Arrow />
            </ButtonLink>
          </div>
        </div>
        <div data-reveal className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-md border border-ink-700 bg-ink-950 p-6">
            <p className="kicker text-ink-400">Public testnet runs</p>
            <p className="mt-4 text-5xl font-semibold tracking-[-0.04em] text-bone-50">{publicRuns.length}</p>
            <p className="mt-3 text-sm leading-relaxed text-ink-300">
              {publicRuns.length ? "Executed on Mezo testnet and Base Sepolia with guardian-signed messages." : deployment ? "Deployed; the canonical run has not been recorded yet." : "None yet. Contracts are not deployed on public testnets; this stays 0 until a real run is recorded."}
            </p>
          </div>
          <div className="rounded-md border border-ink-700 bg-ink-950 p-6">
            <p className="kicker text-ink-400">Local fork rehearsals</p>
            <p className="mt-4 text-5xl font-semibold tracking-[-0.04em] text-ink-300">{rehearsals.length}</p>
            <p className="mt-3 text-sm leading-relaxed text-ink-300">Full lifecycle against forks of the live vault and real Wormhole Core, with a locally substituted guardian key. Useful, but not public evidence.</p>
          </div>
        </div>
      </div>
    </Reveal>
  );
}

const snippet = `import { buildConfig, createReachClients, reconcile, readWrapperState } from "@musd-reach/sdk";

const cfg = buildConfig({ deployments });           // deployments/testnet.json
const clients = createReachClients(cfg);

const nav = await readWrapperState(clients.mezo, cfg); // MUSD per wSMUSD, block-stamped
const backing = await reconcile(clients, cfg);         // chain-only conservation check
if (backing.status !== "BALANCED") throw new Error("do not accept rwSMUSD");`;

export function DeveloperSection() {
  return (
    <Reveal as="section" className="py-24 sm:py-32">
      <div className="shell grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
        <div data-reveal>
          <p className="kicker flex items-center gap-3 text-ink-300">
            <span className="text-ember-400">09</span>
            <span aria-hidden className="h-px w-6 bg-ink-600" />
            Developer integration
          </p>
          <h2 className="mt-5 text-[length:var(--text-headline)] font-semibold leading-[var(--text-headline--line-height)] tracking-[var(--text-headline--letter-spacing)] text-bone-50">
            Accept rwSMUSD <span className="font-serif font-normal italic text-ember-400">on your terms.</span>
          </h2>
          <p className="mt-6 max-w-lg text-[1.0625rem] leading-relaxed text-ink-200">
            rwSMUSD is a plain ERC-20 with permit. Before you accept it, read the wrapper NAV and the backing equation straight from chain with the SDK or the verifier CLI. No API key, no trust in us.
          </p>
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3">
            <Link href="/developers" className="inline-flex items-center gap-2 border-b border-ink-500 pb-0.5 text-[0.9375rem] text-bone-100 hover:border-ember-500">
              Developer docs <Arrow />
            </Link>
            <Link href="/developers#contracts" className="inline-flex items-center gap-2 border-b border-ink-500 pb-0.5 text-[0.9375rem] text-bone-100 hover:border-ember-500">
              Contracts and ABIs <Arrow />
            </Link>
          </div>
        </div>
        <div data-reveal className="overflow-hidden rounded-md border border-ink-700 bg-ink-900">
          <div className="flex items-center justify-between border-b border-ink-700 px-5 py-3">
            <span className="kicker text-ink-400">integrate.ts</span>
            <span className="kicker text-ink-500">TypeScript · viem</span>
          </div>
          <pre className="overflow-x-auto p-5 text-[0.8125rem] leading-relaxed text-bone-200">
            <code className="num">{snippet}</code>
          </pre>
        </div>
      </div>
    </Reveal>
  );
}

const faqs = [
  ["Is rwSMUSD a stablecoin?", "No. It is a claim on one locked wrapper share per unit. Its value is the wrapper's net assets per share, which can rise with real vault yield or fall if the vault is impaired, plus cross-chain risk. There is no peg and no promised APY."],
  ["Where is my money while I hold rwSMUSD?", "On Mezo. Your MUSD is sMUSD principal inside Mezo's native savings vault, owned by the ReachSavingsWrapper; the wrapper shares backing your receipt are locked in the ReachSourceGateway. Nothing about the principal moves to Base."],
  ["Who earns the savings yield?", "The wrapper, on behalf of all wSMUSD holders pro rata, including the shares locked behind every rwSMUSD. Yield you earned before wrapping existing sMUSD stays claimable in your own Mezo account."],
  ["Can a message get stuck?", "A signed message can always be delivered later; there is no expiry. Anyone, including you in this app, can deliver it. Funds are never refunded on a timeout, because the remote receipt could still be minted."],
  ["What if Mezo's vault can't pay out MUSD?", settlementCopy.faq],
  ["Can I borrow against rwSMUSD?", "Not through Reach today. Compatibility with Morpho Blue was tested on a fork, but no market, oracle review, lenders or liquidation path exist on a public network."],
  ["Is it audited?", "No independent audit has been performed. The contracts have unit, fuzz, invariant and fork tests and a Slither pass. Treat it as experimental testnet software."],
  ["Does it charge fees?", "Reach charges no fee. You pay network gas on each chain (BTC on Mezo, ETH on Base Sepolia). Wormhole's message fee on both testnets is currently 0."],
];

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <Reveal as="section" className="surface-light py-24 sm:py-32">
      <div className="shell grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
        <div data-reveal>
          <p className="kicker flex items-center gap-3 text-ink-500">
            <span className="text-ember-600">10</span>
            <span aria-hidden className="h-px w-6 bg-ink-950/20" />
            Questions
          </p>
          <h2 className="mt-5 text-[length:var(--text-headline)] font-semibold leading-[var(--text-headline--line-height)] tracking-[var(--text-headline--letter-spacing)] text-ink-950">
            Straight <span className="font-serif font-normal italic">answers.</span>
          </h2>
        </div>
        <div data-reveal className="border-t border-ink-950/15">
          {faqs.map(([q, a], i) => (
            <div key={q} className="border-b border-ink-950/15">
              <h3>
                <button type="button" aria-expanded={open === i} aria-controls={`faq-${i}`} id={`faq-q-${i}`} onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center justify-between gap-6 py-5 text-left text-[1.0625rem] font-medium tracking-[-0.01em] text-ink-950">
                  {q}
                  <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full border border-ink-950/20 transition-transform duration-300", open === i && "rotate-45")} aria-hidden>
                    <svg viewBox="0 0 12 12" className="h-3 w-3" stroke="currentColor" strokeWidth="1.5">
                      <path d="M6 1v10M1 6h10" />
                    </svg>
                  </span>
                </button>
              </h3>
              <div id={`faq-${i}`} role="region" aria-labelledby={`faq-q-${i}`} hidden={open !== i} className="pb-6 pr-12 leading-relaxed text-ink-700">
                {a}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Reveal>
  );
}

export function FinalCta() {
  return (
    <section className="relative overflow-hidden py-28 sm:py-36">
      <div className="shell">
        <div className="relative overflow-hidden rounded-lg border border-ink-700 bg-ink-900 px-6 py-16 sm:px-14 sm:py-20">
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-ember-500/10 blur-3xl" aria-hidden />
          <p className="kicker text-ink-300">Testnet · experimental</p>
          <h2 className="mt-5 max-w-3xl text-[length:var(--text-headline)] font-semibold leading-[var(--text-headline--line-height)] tracking-[var(--text-headline--letter-spacing)] text-bone-50">
            Keep saving on Mezo. <span className="font-serif font-normal italic text-ember-400">Take the claim with you.</span>
          </h2>
          <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-4">
            <ButtonLink href="/app" className="h-12 px-6">
              Open the app <Arrow />
            </ButtonLink>
            <Link href="/risks" className="inline-flex items-center gap-2 border-b border-ink-500 pb-0.5 text-[0.9375rem] text-bone-100 hover:border-ember-500">
              Read the risks first <Arrow />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
