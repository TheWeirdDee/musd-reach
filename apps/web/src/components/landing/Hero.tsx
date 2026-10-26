"use client";

import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { formatAmount, shortHex } from "@musd-reach/sdk";
import { ButtonLink, Arrow, Chip } from "@/components/ui/primitives";
import { canonicalRun, deployment } from "@/lib/reach";

gsap.registerPlugin(useGSAP);

/** Values for the mechanism cards: a recorded public run if one exists, otherwise symbols. */
function heroValues() {
  if (!canonicalRun) return null;
  const lock = canonicalRun.steps.find((s) => s.id === "02");
  const mint = canonicalRun.steps.find((s) => s.id === "05");
  if (!lock || !mint) return null;
  const shares = BigInt(String(lock.details.sharesLocked ?? "0"));
  return {
    shares: formatAmount(shares, 18, 4),
    transferId: shortHex(String(lock.details.transferId ?? ""), 6, 4),
    sequence: String(lock.details.wormholeSequence ?? ""),
    lockTx: shortHex(lock.txHash ?? "", 6, 4),
    mintTx: shortHex(mint.txHash ?? "", 6, 4),
    runId: canonicalRun.runId,
  };
}

function Field({ k, v, mono = true }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-ink-950/10 py-2 last:border-b-0">
      <span className="font-mono text-[0.625rem] uppercase tracking-[0.12em] text-ink-500">{k}</span>
      <span className={mono ? "num text-[0.8125rem] text-ink-950" : "text-[0.8125rem] text-ink-950"}>{v}</span>
    </div>
  );
}

export function Hero() {
  const root = useRef<HTMLElement>(null);
  const v = heroValues();

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const tl = gsap.timeline({ defaults: { ease: "expo.out" } });
        tl.from("[data-hero-line] > span", { yPercent: 110, duration: 1.1, stagger: 0.09 })
          .from("[data-hero-fade]", { autoAlpha: 0, y: 14, duration: 0.8, stagger: 0.07 }, "-=0.7")
          .from("[data-card=src]", { autoAlpha: 0, x: -40, rotate: -9, duration: 1.1 }, "-=0.9")
          .from("[data-card=dst]", { autoAlpha: 0, x: 40, rotate: 9, duration: 1.1 }, "-=0.95")
          .from("[data-wire]", { scaleX: 0, transformOrigin: "left center", duration: 0.9 }, "-=0.6");
        // The authenticated message travels from custody to receipt, then the receipt "settles".
        const loop = gsap.timeline({ repeat: -1, repeatDelay: 1.4, delay: 2.2 });
        loop
          .fromTo("[data-packet]", { left: "0%", autoAlpha: 0 }, { left: "100%", autoAlpha: 1, duration: 1.6, ease: "power2.inOut" })
          .to("[data-packet]", { autoAlpha: 0, duration: 0.2 })
          .fromTo("[data-settle]", { boxShadow: "0 0 0 0 rgba(140,203,152,0)" }, { boxShadow: "0 0 0 6px rgba(140,203,152,0.18)", duration: 0.35, yoyo: true, repeat: 1 }, "-=0.25");
      });
      return () => mm.revert();
    },
    { scope: root },
  );

  return (
    <section ref={root} className="relative overflow-hidden" aria-labelledby="hero-title">
      <div className="shell grid items-center gap-14 pb-20 pt-10 sm:pt-16 lg:grid-cols-[1.08fr_1fr] lg:gap-10 lg:pb-28 lg:pt-20">
        <div>
          <p data-hero-fade className="kicker mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 text-ink-300">
            <span className="text-ember-400">MUSD savings</span>
            <span aria-hidden className="h-px w-6 bg-ink-600" />
            <span>Mezo → Base</span>
          </p>
          <h1 id="hero-title" className="text-[length:var(--text-display)] font-semibold leading-[var(--text-display--line-height)] tracking-[var(--text-display--letter-spacing)] text-bone-50">
            <span data-hero-line className="block overflow-hidden pb-[0.06em]">
              <span className="block">Your Mezo savings.</span>
            </span>
            <span data-hero-line className="block overflow-hidden pb-[0.08em]">
              <span className="block">
                Free to <span className="font-serif font-normal italic tracking-[-0.02em] text-ember-400">move.</span>
              </span>
            </span>
          </h1>
          <p data-hero-fade className="mt-7 max-w-[34rem] text-lg leading-relaxed text-ink-200 sm:text-[1.1875rem]">
            Keep your savings position on Mezo while holding a backed, transferable claim on Base Sepolia. For Mezo savers who want their position to reach another chain: move the claim, not the savings.
          </p>
          <div data-hero-fade className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-4">
            <ButtonLink href="/app" className="h-12 px-6">
              Open the app <Arrow />
            </ButtonLink>
            <a href="#how" className="group inline-flex items-center gap-2 text-[0.9375rem] text-bone-100">
              <span className="border-b border-ink-500 pb-0.5 transition-colors group-hover:border-ember-500">See how backing works</span>
              <Arrow className="transition-transform group-hover:translate-x-0.5" />
            </a>
          </div>
          <ul data-hero-fade className="mt-10 flex flex-wrap gap-2" aria-label="Current status">
            <li>
              <Chip tone="verified">Native vault verified live</Chip>
            </li>
            <li>
              <Chip tone={deployment ? "verified" : "pending"}>{deployment ? "Reach deployed on testnet" : "Reach contracts not yet deployed"}</Chip>
            </li>
            <li>
              <Chip tone="neutral">No independent audit</Chip>
            </li>
          </ul>
        </div>

        {/* Mechanism visual */}
        <figure className="relative mx-auto w-full max-w-[34rem] lg:max-w-none" aria-label="How a savings claim moves from Mezo to Base">
          <div className="relative grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-4">
            <div data-card="src" className="relative z-10 rotate-[-2.5deg] rounded-md bg-bone-50 p-5 text-ink-950 shadow-lift">
              <div className="mb-3 flex items-center justify-between">
                <span className="kicker text-ink-500">Mezo · custody record</span>
                <span className="h-2 w-2 rounded-full bg-ember-500" aria-hidden />
              </div>
              <p className="text-[1.75rem] font-semibold leading-none tracking-[-0.03em]">{v ? v.shares : <span className="font-serif font-normal italic">n</span>} <span className="text-base font-medium text-ink-500">wSMUSD</span></p>
              <p className="mt-1 text-xs text-ink-500">locked in ReachSourceGateway</p>
              <div className="mt-4">
                <Field k="backing" v="native sMUSD + wrapper yield" mono={false} />
                <Field k="transfer" v={v ? v.transferId : "0x…"} />
                <Field k="wormhole seq" v={v ? v.sequence : "#"} />
                <Field k="tx" v={v ? v.lockTx : "0x…"} />
              </div>
            </div>
            <div data-card="dst" className="relative z-0 rotate-[2deg] rounded-md border border-ink-600 bg-ink-850 p-5 shadow-lift sm:mt-16">
              <div data-settle className="pointer-events-none absolute inset-0 rounded-md" aria-hidden />
              <div className="mb-3 flex items-center justify-between">
                <span className="kicker text-ink-300">Base · receipt</span>
                <span className="h-2 w-2 rounded-full bg-sage-400" aria-hidden />
              </div>
              <p className="text-[1.75rem] font-semibold leading-none tracking-[-0.03em] text-bone-50">{v ? v.shares : <span className="font-serif font-normal italic">n</span>} <span className="text-base font-medium text-ink-300">rwSMUSD</span></p>
              <p className="mt-1 text-xs text-ink-300">minted once, after guardian verification</p>
              <dl className="mt-4 space-y-0 text-[0.8125rem]">
                {[
                  ["verified", "guardian signature"],
                  ["emitter", "enrolled Mezo gateway"],
                  ["replay", "transfer id consumed"],
                  ["tx", v ? v.mintTx : "0x…"],
                ].map(([k, val]) => (
                  <div key={k} className="flex items-baseline justify-between gap-4 border-b border-ink-700 py-2 last:border-b-0">
                    <dt className="font-mono text-[0.625rem] uppercase tracking-[0.12em] text-ink-400">{k}</dt>
                    <dd className="num text-bone-200">{val}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
          {/* message wire */}
          <div className="relative mx-6 mt-6 hidden h-6 sm:block" aria-hidden>
            <div data-wire className="absolute inset-x-0 top-1/2 h-px bg-[repeating-linear-gradient(90deg,var(--color-ink-500)_0_6px,transparent_6px_12px)]" />
            <div data-packet className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-ember-500/60 bg-ink-950 px-2 py-0.5 font-mono text-[0.625rem] uppercase tracking-[0.12em] text-ember-300 opacity-0">
              VAA
            </div>
          </div>
          <figcaption className="mt-5 flex flex-wrap items-center gap-2 text-xs text-ink-400">
            {v ? (
              <>
                <Chip tone="verified">Recorded public-testnet run</Chip>
                <a href={`/proof/${v.runId}`} className="underline decoration-ink-600 underline-offset-4 hover:text-bone-100">
                  {v.runId}
                </a>
              </>
            ) : (
              <>
                <Chip tone="neutral">Mechanism illustration</Chip>
                <span>Not a live transaction. Symbols, not balances.</span>
              </>
            )}
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
