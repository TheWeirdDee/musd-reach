"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Amount, Notice, Skeleton } from "@/components/ui/primitives";
import { pct, ageLabel, USDC_DECIMALS, type MarketState } from "@/lib/markets";

export function MarketStrip({ m }: { m: MarketState | undefined }) {
  const cell = (label: string, value: ReactNode, hint?: string) => (
    <div className="min-w-0 border-t border-ink-700 pt-3">
      <p className="kicker text-ink-400">{label}</p>
      <p className="num mt-1 truncate text-lg text-bone-50">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-400">{hint}</p>}
    </div>
  );
  if (!m) return <Skeleton className="h-20 w-full" />;
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
      {cell("Savings NAV", m.navPerShare ? <Amount value={m.navPerShare} unit="MUSD" places={4} /> : "—", "per rwSMUSD, attested from Mezo")}
      {cell("NAV updated", <span className={m.navFresh ? "" : "text-rust-300"}>{ageLabel(m.navAgeSeconds)}</span>, `valid ${Math.round(m.navMaxAge / 3600)} h`)}
      {cell("Max LTV", pct(Number(m.lltv) / 1e18 * (1 - m.haircutBps / 10_000), 1), `${pct(Number(m.lltv) / 1e18, 0)} LLTV after ${m.haircutBps / 100}% haircut`)}
      {cell("Borrow APR", pct(m.borrowApr), "Morpho adaptive curve")}
      {cell("Lend APR", pct(m.vaultApr), "Reach vault, after fee")}
      {cell("Available", <Amount value={m.liquidity} unit="USDC" decimals={USDC_DECIMALS} places={2} />, `${pct(m.utilization, 1)} utilized`)}
    </div>
  );
}

export function MarketsNotLive() {
  return (
    <Notice tone="pending" title="Market opening">
      The rwSMUSD market on Base Sepolia is being deployed. Meanwhile you can <Link className="underline underline-offset-4" href="/app/portable/new">make savings portable</Link> to receive rwSMUSD.
    </Notice>
  );
}

