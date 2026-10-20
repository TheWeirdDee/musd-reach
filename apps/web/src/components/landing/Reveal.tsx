"use client";

import { useRef, type ReactNode } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/**
 * Reveals `[data-reveal]` descendants as they enter the viewport. Content is visible by default
 * (no-JS and reduced-motion users see everything immediately); motion is layered on only when
 * the user allows it.
 */
export function Reveal({ children, className, as: As = "div" }: { children: ReactNode; className?: string; as?: "div" | "section" }) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const items = gsap.utils.toArray<HTMLElement>("[data-reveal]", ref.current);
        gsap.set(items, { autoAlpha: 0, y: 22 });
        ScrollTrigger.batch(items, {
          start: "top 88%",
          once: true,
          onEnter: (batch) => gsap.to(batch, { autoAlpha: 1, y: 0, duration: 0.9, ease: "expo.out", stagger: 0.08, overwrite: true }),
        });
      });
      return () => mm.revert();
    },
    { scope: ref },
  );
  return (
    <As ref={ref as never} className={className}>
      {children}
    </As>
  );
}

export function SectionHead({ index, kicker, title, lede, light }: { index: string; kicker: string; title: ReactNode; lede?: ReactNode; light?: boolean }) {
  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:gap-12">
      <div data-reveal>
        <p className={`kicker flex items-center gap-3 ${light ? "text-ink-500" : "text-ink-300"}`}>
          <span className={light ? "text-ember-600" : "text-ember-400"}>{index}</span>
          <span aria-hidden className={`h-px w-6 ${light ? "bg-ink-950/20" : "bg-ink-600"}`} />
          {kicker}
        </p>
        <h2 className={`mt-5 text-[length:var(--text-headline)] font-semibold leading-[var(--text-headline--line-height)] tracking-[var(--text-headline--letter-spacing)] ${light ? "text-ink-950" : "text-bone-50"}`}>{title}</h2>
      </div>
      {lede && (
        <div data-reveal className={`self-end text-[1.0625rem] leading-relaxed ${light ? "text-ink-600" : "text-ink-200"}`}>
          {lede}
        </div>
      )}
    </div>
  );
}
