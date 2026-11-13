"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/cn";
import { snapshot, savingsRate, borrowVsWithdraw, MAX_BORROW_SHARE } from "@/lib/economics";

const money = (x: number) => x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pctText = (x: number) => `${(x * 100).toFixed(2)}%`;
const windowName = (d: number) => (d <= 10 ? "last 7 days" : d <= 40 ? "last 30 days" : d <= 120 ? "last 90 days" : "last 6 months");

function NumberField({ label, value, onChange, unit, hint, step = "any" }: { label: string; value: string; onChange: (v: string) => void; unit: string; hint?: string; step?: string }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="text-sm text-ink-300">{label}</label>
      <div className="mt-2 flex items-center rounded-sm border border-ink-600 bg-ink-950 pr-3 transition-colors focus-within:border-ember-500">
        <input id={id} inputMode="decimal" type="number" min="0" step={step} value={value} onChange={(e) => onChange(e.target.value)} className="num h-11 w-full min-w-0 bg-transparent px-3 text-bone-50 outline-none" />
        <span className="shrink-0 whitespace-nowrap text-xs text-ink-400">{unit}</span>
      </div>
      {hint && <p className="mt-1.5 text-xs text-ink-400">{hint}</p>}
    </div>
  );
}

/**
 * "Is borrowing worth it?" Compares keeping the savings and borrowing against them with simply
 * withdrawing the same amount. Pre-filled with Mezo mainnet's measured savings rate and Morpho's
 * USDC borrow rate on Base (analysis/market-data.mjs); every input can be changed.
 */
export function WorthItCalculator({ className, compact = false }: { className?: string; compact?: boolean }) {
  const s = snapshot;
  const windows = s ? s.savings.rates : [];
  const [win, setWin] = useState(s ? savingsRate(s, 30).days : 30);
  const [saved, setSaved] = useState("1000");
  const [borrowed, setBorrowed] = useState("500");
  const [days, setDays] = useState("30");
  const [rs, setRs] = useState(s ? (savingsRate(s, 30).rate * 100).toFixed(2) : "5");
  const [rb, setRb] = useState(s ? (s.morphoBase.usdcBorrowRate * 100).toFixed(2) : "5.5");

  const S = Math.max(0, Number(saved) || 0);
  const B = Math.max(0, Number(borrowed) || 0);
  const D = Math.max(0, Number(days) || 0);
  const tooMuch = B > S * MAX_BORROW_SHARE + 1e-9;
  const r = borrowVsWithdraw({ saved: S, borrowed: B, days: D, savingsRate: (Number(rs) || 0) / 100, borrowRate: (Number(rb) || 0) / 100 });
  const ahead = r.net >= 0;

  return (
    <div className={cn("rounded-md border border-ink-700 bg-ink-900/60 p-5 sm:p-7", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="text-lg font-semibold tracking-[-0.02em] text-bone-50">Is borrowing worth it?</h3>
        {s && <p className="font-mono text-[0.625rem] uppercase tracking-[0.12em] text-ink-400">Mezo mainnet data · {s.asOf}</p>}
      </div>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-300">
        Keep your savings earning and borrow against them, or withdraw the same amount instead. The difference is the amount borrowed × (savings rate − borrow rate) × time.
      </p>

      <div className={cn("mt-6 grid gap-5", compact ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3")}>
        <NumberField label="MUSD saved" value={saved} onChange={setSaved} unit="MUSD" />
        <NumberField label="Amount to borrow" value={borrowed} onChange={setBorrowed} unit="MUSD or USDC" hint={`Up to ${money(S * MAX_BORROW_SHARE)} (69.3% of savings)`} />
        <NumberField label="For how many days" value={days} onChange={setDays} unit="days" step="1" />
        <div className={compact ? "" : "lg:col-span-1"}>
          <NumberField label="Savings rate on Mezo" value={rs} onChange={(v) => { setRs(v); setWin(-1); }} unit="% a year" />
          {windows.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Measured savings rates">
              {windows.map((w) => (
                <button key={w.days} type="button" aria-pressed={win === w.days} onClick={() => { setWin(w.days); setRs((w.rate * 100).toFixed(2)); }} className={cn("rounded-sm border px-2.5 py-1.5 pointer-coarse:py-2.5 text-[0.6875rem] transition-colors", win === w.days ? "border-ember-500 text-bone-50" : "border-ink-600 text-ink-300 hover:border-ink-400")}>
                  {windowName(w.days)} <span className="num">{pctText(w.rate)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <NumberField label="Borrow rate on Base" value={rb} onChange={setRb} unit="% a year" hint={s ? `Morpho USDC loans on Base, weighted average: ${pctText(s.morphoBase.usdcBorrowRate)}` : undefined} />
      </div>

      <dl className="mt-7 grid gap-x-6 gap-y-4 border-t border-ink-700 pt-6 sm:grid-cols-3">
        <div>
          <dt className="font-mono text-[0.625rem] uppercase tracking-[0.12em] text-ink-400">Savings keep earning</dt>
          <dd className="num mt-1 text-xl font-semibold text-bone-50">+{money(r.savingsEarned)}</dd>
        </div>
        <div>
          <dt className="font-mono text-[0.625rem] uppercase tracking-[0.12em] text-ink-400">Interest on the loan</dt>
          <dd className="num mt-1 text-xl font-semibold text-bone-50">−{money(r.interest)}</dd>
          <dd className="mt-1 text-xs text-ink-400">lenders {money(r.lenders)} · Reach {money(r.reach)}</dd>
        </div>
        <div>
          <dt className="font-mono text-[0.625rem] uppercase tracking-[0.12em] text-ink-400">Versus withdrawing instead</dt>
          <dd className={cn("num mt-1 text-xl font-semibold", ahead ? "text-sage-400" : "text-rust-400")}>{ahead ? "+" : "−"}{money(Math.abs(r.net))}</dd>
          <dd className="mt-1 text-xs text-ink-400">withdrawing would earn {money(r.withdrawInstead)}</dd>
        </div>
      </dl>
      <p className={cn("mt-5 text-sm leading-relaxed", tooMuch ? "text-rust-400" : "text-ink-200")} aria-live="polite">
        {tooMuch
          ? "That is above the largest loan the market allows at opening (69.3% of the savings)."
          : ahead
            ? "Borrowing comes out ahead: the savings earn more than the loan costs, and the dollars stay usable on Base."
            : "At these rates, withdrawing is cheaper. Borrowing still keeps the savings position open, but it costs the difference shown."}
      </p>
      {!compact && (
        <p className="mt-3 text-xs leading-relaxed text-ink-400">
          Savings rates are what Mezo&apos;s Savings Vault actually paid over each window, read from its on-chain yield index. Rates change: Mezo shares a pool of MUSD fees among everyone saved, so the rate rises when savers leave and falls when they arrive. Excludes gas. Staked sMUSD earns MEZO emissions instead of this rate, so it is not counted here.
        </p>
      )}
    </div>
  );
}
