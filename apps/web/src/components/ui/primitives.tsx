"use client";

import Link from "next/link";
import { forwardRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { formatAmount, shortHex } from "@musd-reach/sdk";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
// Button — one family, three intents, two sizes. Never a dead button: disabled
// buttons always carry a visible reason via `hint`.
// ---------------------------------------------------------------------------

type Intent = "primary" | "secondary" | "ghost";
const intents: Record<Intent, string> = {
  primary:
    "bg-ember-500 text-ink-950 hover:bg-ember-400 active:bg-ember-600 disabled:bg-ink-700 disabled:text-ink-400",
  secondary:
    "border border-ink-600 bg-ink-850 text-bone-100 hover:border-ink-400 hover:bg-ink-800 disabled:text-ink-400 disabled:border-ink-700",
  ghost: "text-bone-100 hover:text-ember-400 disabled:text-ink-500",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  intent?: Intent;
  size?: "md" | "lg";
  busy?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { intent = "primary", size = "md", busy, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-sm font-medium tracking-[-0.01em] transition-[background,color,border-color,transform] duration-200 ease-[var(--ease-out-expo)] disabled:cursor-not-allowed",
        intent !== "ghost" && "active:translate-y-px",
        size === "md" ? "h-11 px-5 text-[0.9375rem]" : "h-13 px-6 text-base",
        intents[intent],
        className,
      )}
      {...rest}
    >
      {busy && <Spinner />}
      {children}
    </button>
  );
});

export function ButtonLink({
  href,
  intent = "primary",
  className,
  children,
  external,
}: {
  href: string;
  intent?: Intent;
  className?: string;
  children: ReactNode;
  external?: boolean;
}) {
  const cls = cn(
    "inline-flex h-11 items-center justify-center gap-2 rounded-sm px-5 text-[0.9375rem] font-medium tracking-[-0.01em] transition-[background,color,border-color] duration-200",
    intents[intent],
    className,
  );
  return external ? (
    <a href={href} className={cls} target="_blank" rel="noreferrer">
      {children}
    </a>
  ) : (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}

export function Arrow({ className, diagonal }: { className?: string; diagonal?: boolean }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={cn("h-3.5 w-3.5 shrink-0", diagonal && "-rotate-45", className)} fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M2 8h11M9 4l4 4-4 4" />
    </svg>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn("h-4 w-4 animate-spin", className)} fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Status — chain state vocabulary, consistent everywhere.
// ---------------------------------------------------------------------------

export type Tone = "verified" | "pending" | "failed" | "neutral" | "accent" | "info";
const tones: Record<Tone, string> = {
  verified: "border-sage-500/40 bg-sage-500/10 text-sage-300",
  pending: "border-sand-500/40 bg-sand-500/10 text-sand-300",
  failed: "border-rust-500/40 bg-rust-500/10 text-rust-300",
  neutral: "border-ink-600 bg-ink-800 text-ink-200",
  accent: "border-ember-500/40 bg-ember-500/10 text-ember-300",
  info: "border-ink-500 bg-ink-850 text-bone-200",
};

export function Chip({ tone = "neutral", children, pulse, className }: { tone?: Tone; children: ReactNode; pulse?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 font-mono text-[0.6875rem] uppercase tracking-[0.08em]", tones[tone], className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full bg-current", pulse && "animate-pulse-dot")} aria-hidden />
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Layout primitives
// ---------------------------------------------------------------------------

export function Panel({ className, children, as: As = "section" }: { className?: string; children: ReactNode; as?: "section" | "div" | "article" }) {
  return <As className={cn("rounded-md border border-ink-700 bg-ink-900 shadow-panel", className)}>{children}</As>;
}

export function Kicker({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("kicker text-ink-300", className)}>{children}</p>;
}

export function Row({ label, children, hint }: { label: ReactNode; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-ink-750 py-3 last:border-b-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
      <dt className="text-sm text-ink-300">
        {label}
        {hint && <span className="mt-0.5 block text-xs text-ink-400">{hint}</span>}
      </dt>
      <dd className="min-w-0 text-left text-sm text-bone-100 sm:text-right">{children}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Amounts — exact bigint formatting, truncated, never rounded up.
// ---------------------------------------------------------------------------

export function Amount({ value, unit, places = 4, decimals = 18, className }: { value: bigint | null | undefined; unit?: string; places?: number; decimals?: number; className?: string }) {
  if (value === null || value === undefined) return <span className={cn("num text-ink-400", className)}>—</span>;
  return (
    <span className={cn("num", className)} title={`${value.toString()} base units`}>
      {formatAmount(value, decimals, places)}
      {unit && <span className="ml-1.5 text-ink-300">{unit}</span>}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Hashes and addresses — copyable, explorer-linked, never overflowing.
// ---------------------------------------------------------------------------

export function Hash({ value, href, full, className }: { value: string; href?: string; full?: boolean; className?: string }) {
  const [copied, setCopied] = useState(false);
  const text = full ? value : shortHex(value, 6, 4);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable; the value is still visible */
    }
  };
  return (
    <span className={cn("inline-flex max-w-full items-center gap-1.5 align-middle", className)}>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" className={cn("num text-[0.8125rem] text-bone-200 underline decoration-ink-500 underline-offset-4 hover:text-ember-400 hover:decoration-ember-500", full && "break-hash")} title={value}>
          {text}
        </a>
      ) : (
        <span className={cn("num text-[0.8125rem] text-bone-200", full && "break-hash")} title={value}>
          {text}
        </span>
      )}
      <button type="button" onClick={copy} className="grid h-7 w-7 shrink-0 place-items-center rounded-xs text-ink-400 hover:bg-ink-800 hover:text-bone-100" aria-label={copied ? "Copied" : `Copy ${value}`}>
        {copied ? (
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <path d="M3 8.5 6.5 12 13 4.5" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
            <rect x="5" y="5" width="8.5" height="8.5" rx="1.5" />
            <path d="M10.5 5V3.5A1.5 1.5 0 0 0 9 2H3.5A1.5 1.5 0 0 0 2 3.5V9a1.5 1.5 0 0 0 1.5 1.5H5" />
          </svg>
        )}
      </button>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Notices and empty states
// ---------------------------------------------------------------------------

export function Notice({ tone = "info", title, children, className }: { tone?: Tone; title?: ReactNode; children?: ReactNode; className?: string }) {
  const bar: Record<Tone, string> = {
    verified: "bg-sage-400",
    pending: "bg-sand-400",
    failed: "bg-rust-400",
    neutral: "bg-ink-500",
    accent: "bg-ember-500",
    info: "bg-bone-300",
  };
  return (
    <div role={tone === "failed" ? "alert" : "note"} className={cn("relative overflow-hidden rounded-sm border border-ink-700 bg-ink-850 py-3 pl-5 pr-4 text-sm leading-relaxed text-ink-200", className)}>
      <span className={cn("absolute inset-y-0 left-0 w-[3px]", bar[tone])} aria-hidden />
      {title && <p className="mb-1 font-medium text-bone-100">{title}</p>}
      {children}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-md border border-dashed border-ink-600 px-6 py-8">
      <p className="text-base font-medium text-bone-100">{title}</p>
      {children && <div className="max-w-prose text-sm leading-relaxed text-ink-300">{children}</div>}
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <span className={cn("inline-block animate-pulse rounded-xs bg-ink-800", className)} aria-hidden />;
}
