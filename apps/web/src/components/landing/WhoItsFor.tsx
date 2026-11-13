"use client";

import { useRef, type ReactNode } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/** Splits a line into words so each one can come into focus on its own. */
function Words({ text, accent }: { text: string; accent?: string[] }) {
  return (
    <>
      {text.split(" ").map((w, i) => (
        <span key={i} data-word className={`inline-block will-change-transform ${accent?.includes(w.replace(/[.,]/g, "")) ? "text-ember-400" : ""}`}>
          {w}
          {" "}
        </span>
      ))}
    </>
  );
}

type Scene = { kicker: string; lines: { text: string; accent?: string[] }[]; sub: ReactNode };

const scenes: Scene[] = [
  {
    kicker: "Who Reach is for",
    lines: [{ text: "Built for two people.", accent: ["two"] }],
    sub: "One savings position on Mezo connects them.",
  },
  {
    kicker: "The saver",
    lines: [{ text: "Savers" }, { text: "who need liquidity.", accent: ["liquidity"] }],
    sub: "Keep MUSD earning in Mezo's Savings Vault and borrow against it on Base, without unwinding a thing.",
  },
  {
    kicker: "The lender",
    lines: [{ text: "Lenders" }, { text: "who want yield backed by Mezo savings.", accent: ["Mezo", "savings"] }],
    sub: "Every loan they fund is collateralized by MUSD locked in Mezo's own vault.",
  },
  {
    kicker: "In the dollars you choose",
    lines: [{ text: "Save in MUSD.", accent: ["MUSD"] }, { text: "Lend and borrow in MUSD or USDC.", accent: ["MUSD", "USDC"] }],
    sub: "MUSD travels on Mezo's own bridge. Pick the market that fits.",
  },
];

export function WhoItsFor() {
  const root = useRef<HTMLElement>(null);
  const code = useRef<HTMLSpanElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const stage = root.current!.querySelector<HTMLElement>("[data-stage]")!;
        const all = gsap.utils.toArray<HTMLElement>("[data-scene]", root.current);
        // Film mode: one full-height frame, scenes stacked on top of each other.
        gsap.set(stage, { height: "100svh" });
        // Titles sit low in the frame, like film subtitles, so little empty frame trails the last scene.
        gsap.set(all, { position: "absolute", inset: 0, autoAlpha: 0, justifyContent: "flex-end", paddingBottom: "calc(7svh + 3rem)" });

        const tl = gsap.timeline({
          defaults: { ease: "power3.out" },
          scrollTrigger: {
            trigger: stage,
            start: "top top",
            end: () => `+=${window.innerHeight * all.length * 0.9}`,
            pin: true,
            scrub: 0.7,
            onUpdate: (self) => {
              if (code.current) code.current.textContent = `SCENE ${String(Math.min(all.length, Math.floor(self.progress * all.length) + 1)).padStart(2, "0")} / ${String(all.length).padStart(2, "0")}`;
            },
          },
        });

        tl.fromTo("[data-bar=top]", { yPercent: -100 }, { yPercent: 0, duration: 0.3 }, 0)
          .fromTo("[data-bar=bottom]", { yPercent: 100 }, { yPercent: 0, duration: 0.3 }, 0)
          .fromTo("[data-vignette]", { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 }, 0);

        all.forEach((scene, i) => {
          const words = scene.querySelectorAll("[data-word]");
          tl.set(scene, { autoAlpha: 1 })
            .fromTo(scene.querySelector("[data-kicker]"), { autoAlpha: 0, letterSpacing: "0.4em" }, { autoAlpha: 1, letterSpacing: "0.14em", duration: 0.35 })
            .fromTo(words, { autoAlpha: 0, yPercent: 35, scale: 1.08, filter: "blur(14px)" }, { autoAlpha: 1, yPercent: 0, scale: 1, filter: "blur(0px)", duration: 0.55, stagger: 0.07 }, "<0.1")
            .fromTo(scene.querySelector("[data-sub]"), { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 0.35 }, "-=0.2")
            .to({}, { duration: 0.7 }); // hold the frame so it can be read
          if (i < all.length - 1) tl.to(scene, { autoAlpha: 0, scale: 0.97, filter: "blur(10px)", duration: 0.35, ease: "power2.in" });
        });
        tl.to({}, { duration: 0.3 });
        return () => gsap.set([stage, ...all], { clearProps: "all" });
      });
      return () => mm.revert();
    },
    { scope: root },
  );

  return (
    <section ref={root} aria-labelledby="who-title" className="relative bg-ink-950">
      <h2 id="who-title" className="sr-only">
        Who Reach is for: savers who need liquidity, and lenders who want yield backed by Mezo savings. Save in MUSD; lend and borrow in MUSD or USDC.
      </h2>
      <div data-stage className="relative overflow-hidden">
        {/* Cinematic frame: letterbox bars, vignette and a faint scanline texture. */}
        <div data-bar="top" aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-20 hidden h-[calc(7svh+4rem)] bg-black motion-safe:block" />
        <div data-bar="bottom" aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-20 hidden h-[7svh] bg-black motion-safe:block" />
        <div data-vignette aria-hidden className="pointer-events-none absolute inset-0 z-10 hidden bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(0,0,0,0.65)_100%)] motion-safe:block" />
        <div aria-hidden className="pointer-events-none absolute inset-0 z-10 opacity-[0.05] [background:repeating-linear-gradient(0deg,#fff_0px,#fff_1px,transparent_1px,transparent_3px)]" />
        <span ref={code} aria-hidden className="num absolute left-4 top-[calc(4rem+0.75rem)] z-30 hidden text-[0.625rem] tracking-[0.2em] text-ink-400 motion-safe:block sm:left-8">
          SCENE 01 / {String(scenes.length).padStart(2, "0")}
        </span>

        {scenes.map((s) => (
          <div key={s.kicker} data-scene className="relative flex min-h-[70svh] flex-col justify-center px-4 py-20 sm:px-10 lg:px-20">
            <p data-kicker className="kicker mb-6 text-ember-400">{s.kicker}</p>
            <p className="max-w-[16ch] text-[clamp(2.75rem,9.5vw,9rem)] font-black leading-[0.92] tracking-[-0.045em] text-bone-50" aria-hidden>
              {s.lines.map((l) => (
                <span key={l.text} className="block">
                  <Words text={l.text} accent={l.accent} />
                </span>
              ))}
            </p>
            <p data-sub className="mt-8 max-w-xl text-lg leading-relaxed text-ink-200 sm:text-xl">{s.sub}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
