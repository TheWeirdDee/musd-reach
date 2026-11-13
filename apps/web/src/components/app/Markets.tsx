"use client";

import Link from "next/link";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { Amount, Notice, Skeleton } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { marketDefs, marketDef, useMarket, pct, ageLabel, type LoanAsset, type MarketDef, type MarketState } from "@/lib/markets";

export function MarketStrip({ m, def }: { m: MarketState | undefined; def: MarketDef }) {
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
      {cell("Available", <Amount value={m.liquidity} unit={def.asset} decimals={def.decimals} places={2} />, `${pct(m.utilization, 1)} utilized`)}
    </div>
  );
}

/** Both markets' live numbers, shown before a wallet is connected so visitors see rates and depth first. */
export function MarketsPreview({ className }: { className?: string }) {
  const musd = useMarket(undefined, "MUSD");
  const usdc = useMarket(undefined, "USDC");
  const rows = [
    { def: marketDef("MUSD"), m: musd.data, name: "MUSD market", note: "Borrow or lend Mezo's own MUSD" },
    { def: marketDef("USDC"), m: usdc.data, name: "USDC market", note: "Borrow or lend USDC" },
  ];
  return (
    <section className={cn("space-y-4", className)} aria-label="Live markets">
      <p className="kicker text-ink-300">Live now on Base Sepolia</p>
      {rows.map((r) =>
        r.def ? (
          <div key={r.name} className="rounded-md border border-ink-700 bg-ink-900/60 p-5">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold tracking-[-0.02em] text-bone-50">{r.name}</h2>
              <p className="text-xs text-ink-400">{r.note}</p>
            </div>
            <MarketStrip m={r.m} def={r.def} />
          </div>
        ) : null,
      )}
    </section>
  );
}

/** Selected loan asset, kept in the URL (?asset=MUSD) so links and refreshes keep the choice. */
export function useLoanAsset(): [LoanAsset, (a: LoanAsset) => void] {
  const fallback = marketDefs[0]?.asset ?? "USDC";
  const fromUrl = useSyncExternalStore(noSubscribe, readAssetParam, () => null);
  const [chosen, setChosen] = useState<LoanAsset | null>(null);
  const asset = chosen ?? fromUrl ?? fallback;
  const choose = (a: LoanAsset) => {
    setChosen(a);
    const url = new URL(window.location.href);
    url.searchParams.set("asset", a);
    window.history.replaceState(null, "", url);
  };
  return [asset, choose];
}

const noSubscribe = () => () => {};
function readAssetParam(): LoanAsset | null {
  const q = new URLSearchParams(window.location.search).get("asset")?.toUpperCase();
  return (q === "USDC" || q === "MUSD") && marketDefs.some((d) => d.asset === q) ? q : null;
}

const assetCopy: Record<LoanAsset, string> = {
  MUSD: "Mezo's own stablecoin on Base, via Mezo's bridge",
  USDC: "Circle USDC on Base",
};

export function AssetSwitch({ asset, onChange, disabled, verb }: { asset: LoanAsset; onChange: (a: LoanAsset) => void; disabled?: boolean; verb: string }) {
  if (marketDefs.length < 2) return null;
  return (
    <div className="grid grid-cols-2 gap-2" role="tablist" aria-label={`${verb} asset`}>
      {marketDefs.map((d) => (
        <button
          key={d.asset}
          role="tab"
          type="button"
          aria-selected={asset === d.asset}
          disabled={disabled}
          onClick={() => onChange(d.asset)}
          className={cn("rounded-sm border px-3 py-2.5 text-left transition-colors", asset === d.asset ? "border-ember-500 bg-ember-500/[0.06]" : "border-ink-600 hover:border-ink-400")}
        >
          <span className="block text-sm font-medium text-bone-50">{verb} {d.asset}</span>
          <span className="block text-xs text-ink-400">{assetCopy[d.asset]}</span>
        </button>
      ))}
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
