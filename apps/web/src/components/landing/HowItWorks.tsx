"use client";

import { useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { Reveal, SectionHead } from "./Reveal";
import { cn } from "@/lib/cn";
import { settlementCopy } from "@/lib/settlement";

gsap.registerPlugin(ScrollTrigger, useGSAP);

type Step = {
  n: string;
  leg: "out" | "back";
  title: string;
  body: string;
  mezo: { label: string; value: string; tone?: "ember" | "sage" | "sand" | "muted" }[];
  base: { label: string; value: string; tone?: "ember" | "sage" | "sand" | "muted" }[];
  message?: string;
};

const steps: Step[] = [
  {
    n: "01",
    leg: "out",
    title: "Wrap real savings",
    body: "Your MUSD goes into Mezo's native savings vault. The wrapper owns that sMUSD principal and every bit of yield it earns from now on, and mints you wSMUSD shares priced at the wrapper's current net assets.",
    mezo: [
      { label: "native sMUSD in wrapper", value: "+ amount", tone: "ember" },
      { label: "your wSMUSD", value: "+ n shares", tone: "ember" },
    ],
    base: [{ label: "rwSMUSD supply", value: "unchanged", tone: "muted" }],
  },
  {
    n: "02",
    leg: "out",
    title: "Lock shares, publish a message",
    body: "The source gateway takes custody of exactly n wSMUSD and publishes a Wormhole message binding the amount, recipient, both chain ids, both gateways, the wrapper and the receipt. No refund-on-timeout path exists.",
    mezo: [
      { label: "custody (locked)", value: "+ n wSMUSD", tone: "ember" },
      { label: "in-flight issue", value: "n", tone: "sand" },
    ],
    base: [{ label: "rwSMUSD supply", value: "unchanged", tone: "muted" }],
    message: "ISSUE · guardians observe after Mezo finality",
  },
  {
    n: "03",
    leg: "out",
    title: "Verify, then mint once",
    body: "Anyone can deliver the guardian-signed message to Base. The destination gateway checks the signatures, the enrolled emitter, every bound field and the transfer id, then mints exactly n rwSMUSD. A second delivery reverts.",
    mezo: [{ label: "custody (locked)", value: "n wSMUSD", tone: "ember" }],
    base: [
      { label: "rwSMUSD minted", value: "+ n", tone: "sage" },
      { label: "transfer id", value: "consumed", tone: "sage" },
    ],
  },
  {
    n: "04",
    leg: "back",
    title: "Burn on Base",
    body: "Whoever holds rwSMUSD can redeem: the receipt is burned first, and a REDEEM message names a Mezo recipient and whether to deliver wSMUSD shares or MUSD.",
    mezo: [{ label: "custody (locked)", value: "n wSMUSD", tone: "ember" }],
    base: [
      { label: "rwSMUSD burned", value: "− n", tone: "ember" },
      { label: "in-flight redemption", value: "n", tone: "sand" },
    ],
    message: "REDEEM · guardians observe after Base finality",
  },
  {
    n: "05",
    leg: "back",
    title: "Release exactly what was burned",
    body: settlementCopy.howItWorks,
    mezo: [
      { label: "custody (locked)", value: "− n wSMUSD", tone: "sage" },
      { label: "recipient", value: "n wSMUSD or MUSD", tone: "sage" },
    ],
    base: [{ label: "rwSMUSD supply", value: "− n", tone: "muted" }],
  },
];

const toneCls = { ember: "text-ember-300", sage: "text-sage-300", sand: "text-sand-300", muted: "text-ink-400" } as const;

function ChainCard({ chain, rows }: { chain: string; rows: Step["mezo"] }) {
  return (
    <div className="rounded-sm border border-ink-700 bg-ink-850 p-4">
      <p className="kicker mb-3 text-ink-400">{chain}</p>
      <dl className="space-y-2">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-3">
            <dt className="text-sm text-ink-300">{r.label}</dt>
            <dd className={cn("num text-sm", toneCls[r.tone ?? "muted"])}>{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function HowItWorks() {
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const items = gsap.utils.toArray<HTMLElement>("[data-step]", ref.current);
      items.forEach((el, i) => {
        ScrollTrigger.create({
          trigger: el,
          start: "top 55%",
          end: "bottom 55%",
          onToggle: (self) => self.isActive && setActive(i),
        });
      });
    },
    { scope: ref },
  );

  const s = steps[active]!;

  return (
    <Reveal as="section" className="relative py-24 sm:py-32">
      <span id="how" className="absolute -top-16" aria-hidden />
      <div className="shell">
        <SectionHead
          index="02"
          kicker="How Reach works"
          title={
            <>
              One claim, <span className="font-serif font-normal italic text-ember-400">never two.</span>
            </>
          }
          lede={<p>Every rwSMUSD unit on Base corresponds to one wSMUSD unit locked on Mezo. Value moves only after guardian-signed messages are verified on the other side, and only once.</p>}
        />

        <div ref={ref} className="mt-16 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
          <ol className="space-y-4 lg:space-y-[28vh] lg:py-[12vh]">
            {steps.map((st, i) => (
              <li key={st.n} data-step data-reveal className={cn("rounded-md border p-6 transition-colors duration-500 lg:border-transparent lg:p-0", "border-ink-700")}>
                <div className="flex items-baseline gap-4">
                  <span className={cn("num text-sm transition-colors duration-500", i === active ? "text-ember-400" : "text-ink-500")}>{st.n}</span>
                  <span className="kicker text-ink-400">{st.leg === "out" ? "Outbound" : "Return"}</span>
                </div>
                <h3 className={cn("mt-3 text-[length:var(--text-title)] font-semibold leading-[var(--text-title--line-height)] tracking-[var(--text-title--letter-spacing)] transition-colors duration-500", i === active ? "text-bone-50" : "lg:text-ink-400 text-bone-50")}>{st.title}</h3>
                <p className="mt-3 max-w-xl leading-relaxed text-ink-300">{st.body}</p>
                {/* Mobile: each step carries its own state */}
                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:hidden">
                  <ChainCard chain="Mezo testnet" rows={st.mezo} />
                  <ChainCard chain="Base Sepolia" rows={st.base} />
                </div>
              </li>
            ))}
          </ol>

          <div className="hidden lg:block">
            <div className="sticky top-28 rounded-md border border-ink-700 bg-ink-900 p-6 shadow-panel" aria-live="polite">
              <div className="flex items-center justify-between">
                <p className="kicker text-ink-300">State after step {s.n}</p>
                <div className="flex gap-1.5" aria-hidden>
                  {steps.map((x, i) => (
                    <span key={x.n} className={cn("h-1 w-6 rounded-full transition-colors duration-500", i <= active ? "bg-ember-500" : "bg-ink-700")} />
                  ))}
                </div>
              </div>
              <div className="mt-6 grid grid-cols-2 gap-4">
                <ChainCard chain="Mezo testnet" rows={s.mezo} />
                <ChainCard chain="Base Sepolia" rows={s.base} />
              </div>
              <div className="relative mt-6 h-12 rounded-sm border border-dashed border-ink-600">
                <span className="absolute inset-0 grid place-items-center px-4 text-center font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-ink-400">
                  {s.message ?? "no message in flight"}
                </span>
                {s.message && <span className={cn("absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-ember-500", s.leg === "out" ? "left-3" : "right-3")} aria-hidden />}
              </div>
              <p className="mt-6 border-t border-ink-700 pt-5 font-mono text-[0.75rem] leading-relaxed text-ink-300">
                invariant: <span className="text-bone-100">locked wSMUSD = rwSMUSD supply + in-flight issues + in-flight redemptions</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </Reveal>
  );
}
