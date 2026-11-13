"use client";

import { formatUnits } from "viem";
import { useWrapper } from "@/lib/hooks";
import { useMarket, useMarketActivity, marketDef, pct } from "@/lib/markets";

const fmt = (v: bigint, d: number) => Number(formatUnits(v, d)).toLocaleString("en-US", { maximumFractionDigits: 2 });

/** First-screen numbers, read from Mezo testnet and Base Sepolia in the visitor's browser. */
export function LiveStats() {
  const w = useWrapper();
  const musd = useMarket(undefined, "MUSD");
  const usdc = useMarket(undefined, "USDC");
  const act = useMarketActivity();
  const musdDef = marketDef("MUSD");
  const usdcDef = marketDef("USDC");

  const cells: { label: string; value: string | null; note: string }[] = [
    { label: "MUSD saved on Mezo through Reach", value: w.data ? `${fmt(w.data.totalAssets, 18)} MUSD` : null, note: "in Mezo's Savings Vault, earning" },
    {
      label: "Ready to borrow on Base",
      value: musd.data || usdc.data ? [musd.data && musdDef ? `${fmt(musd.data.liquidity, 18)} MUSD` : null, usdc.data && usdcDef ? `${fmt(usdc.data.liquidity, 6)} USDC` : null].filter(Boolean).join(" · ") : null,
      note: "lent by the Reach MUSD and USDC Vaults",
    },
    { label: "MUSD borrow rate", value: musd.data ? pct(musd.data.borrowApr) : null, note: "Morpho adaptive curve, now" },
    { label: "Wallets in the markets", value: act.data ? String(act.data.wallets.length) : null, note: "lenders and borrowers, from logs" },
  ];

  return (
    <div className="shell pb-16" aria-live="polite">
      <dl data-hero-fade className="grid grid-cols-2 gap-x-6 gap-y-6 border-t border-ink-700 pt-6 lg:grid-cols-4">
        {cells.map((c) => (
          <div key={c.label} className="min-w-0">
            <dt className="font-mono text-[0.625rem] uppercase tracking-[0.12em] text-ink-400">{c.label}</dt>
            <dd className="num mt-2 truncate text-xl font-semibold tracking-[-0.02em] text-bone-50 sm:text-2xl">{c.value ?? <span className="text-ink-400">…</span>}</dd>
            <dd className="mt-1 text-xs text-ink-400">{c.note}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 flex items-center gap-2 text-[0.6875rem] text-ink-400">
        <span className="h-1.5 w-1.5 rounded-full bg-sage-400" aria-hidden /> Live from Mezo testnet and Base Sepolia, read in your browser.
      </p>
    </div>
  );
}
