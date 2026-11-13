"use client";

import Link from "next/link";

export type Success = { title: string; body?: string; href?: string; next?: { href: string; label: string }[] };

/** The moment an action lands: what the person now has, proof on the explorer, and what to do next. */
export function SuccessCard({ s, onClose }: { s: Success; onClose: () => void }) {
  return (
    <div role="status" className="relative overflow-hidden rounded-md border border-sage-500/40 bg-sage-500/[0.06] p-5">
      <span className="absolute inset-y-0 left-0 w-[3px] bg-sage-400" aria-hidden />
      <p className="font-mono text-[0.625rem] uppercase tracking-[0.14em] text-sage-300">Done · confirmed on-chain</p>
      <p className="mt-2 text-xl font-semibold tracking-[-0.02em] text-bone-50">{s.title}</p>
      {s.body && <p className="mt-1.5 text-sm leading-relaxed text-ink-200">{s.body}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        {s.next?.map((n) => (
          <Link key={n.href} href={n.href} className="font-medium text-bone-50 underline underline-offset-4 hover:text-ember-400">
            {n.label} →
          </Link>
        ))}
        {s.href && (
          <a href={s.href} target="_blank" rel="noreferrer" className="text-ink-300 underline underline-offset-4 hover:text-bone-100">
            View transaction ↗
          </a>
        )}
      </div>
      <button type="button" onClick={onClose} aria-label="Close" className="absolute right-2 top-2 h-7 w-7 rounded-sm text-ink-400 hover:text-bone-100">
        ×
      </button>
    </div>
  );
}
