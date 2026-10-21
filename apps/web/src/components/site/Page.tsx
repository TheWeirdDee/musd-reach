import type { ReactNode } from "react";

/** Standard content page frame for non-app routes. */
export function ContentPage({ kicker, title, lede, children }: { kicker: string; title: ReactNode; lede?: ReactNode; children: ReactNode }) {
  return (
    <div className="shell pb-24">
      <header className="max-w-3xl pb-10 pt-12 sm:pt-16">
        <p className="kicker text-ink-300">{kicker}</p>
        <h1 className="mt-3 text-[length:var(--text-headline)] font-semibold leading-[var(--text-headline--line-height)] tracking-[var(--text-headline--letter-spacing)] text-bone-50">{title}</h1>
        {lede && <div className="mt-5 text-[1.0625rem] leading-relaxed text-ink-300">{lede}</div>}
      </header>
      {children}
    </div>
  );
}

export function H2({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h2 id={id} className="scroll-mt-24 text-[length:var(--text-title)] font-semibold leading-[var(--text-title--line-height)] tracking-[var(--text-title--letter-spacing)] text-bone-50">
      {children}
    </h2>
  );
}

export function Prose({ children }: { children: ReactNode }) {
  return <div className="max-w-3xl space-y-4 text-[0.9875rem] leading-relaxed text-ink-200 [&_code]:rounded-xs [&_code]:bg-ink-850 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.8125rem] [&_code]:text-bone-100 [&_strong]:text-bone-50">{children}</div>;
}

export function Code({ children, label }: { children: string; label?: string }) {
  return (
    <div className="overflow-hidden rounded-md border border-ink-700 bg-ink-900">
      {label && <div className="border-b border-ink-700 px-4 py-2.5 font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-ink-400">{label}</div>}
      <pre tabIndex={0} aria-label={label ? `${label} code` : "Code example"} className="overflow-x-auto p-4 text-[0.8125rem] leading-relaxed text-bone-200">
        <code className="num">{children}</code>
      </pre>
    </div>
  );
}
