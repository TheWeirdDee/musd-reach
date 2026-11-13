"use client";

import { useToasts, dismissToast } from "@/lib/toasts";
import { Spinner } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";

/** Bottom-right stack of transaction status pop-ups, announced to screen readers. */
export function Toaster() {
  const toasts = useToasts();
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-4 z-[90] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[24rem]">
      {toasts.map((t) => (
        <div key={t.id} role={t.kind === "failed" ? "alert" : "status"} className={cn("pointer-events-auto relative w-full overflow-hidden rounded-md border bg-ink-850 py-3 pl-5 pr-10 text-sm shadow-lift", t.kind === "failed" ? "border-rust-500/60" : t.kind === "done" ? "border-sage-500/50" : "border-ink-600")}>
          <span className={cn("absolute inset-y-0 left-0 w-[3px]", t.kind === "failed" ? "bg-rust-400" : t.kind === "done" ? "bg-sage-400" : "bg-ember-500")} aria-hidden />
          <p className="flex items-center gap-2 font-medium text-bone-50">
            {t.kind === "sending" && <Spinner className="h-3.5 w-3.5" />}
            {t.kind === "done" && <span className="text-sage-400" aria-hidden>✓</span>}
            {t.kind === "failed" && <span className="text-rust-400" aria-hidden>!</span>}
            {t.title}
          </p>
          {t.body && <p className="mt-1 leading-relaxed text-ink-200">{t.body}</p>}
          {t.href && (
            <a href={t.href} target="_blank" rel="noreferrer" className="mt-1.5 inline-block text-xs text-ink-300 underline underline-offset-4 hover:text-bone-100">
              {t.linkLabel ?? "View on explorer"} ↗
            </a>
          )}
          <button type="button" onClick={() => dismissToast(t.id)} aria-label="Close" className="absolute right-2 top-2 h-7 w-7 rounded-sm text-ink-400 hover:text-bone-100">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
