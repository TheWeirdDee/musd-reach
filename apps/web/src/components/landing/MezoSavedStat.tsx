"use client";

import { formatUnits } from "viem";
import { useWrapper } from "@/lib/hooks";
import { reachConfig } from "@/lib/reach";

/** Live: MUSD that Reach savers hold in Mezo's Savings Vault, read from the wrapper on Mezo. */
export function MezoSavedStat() {
  const w = useWrapper();
  const d = reachConfig.deployment;
  const value = w.data ? Number(formatUnits(w.data.totalAssets, 18)) : null;
  return (
    <div className="mt-10 flex flex-wrap items-end gap-x-8 gap-y-3 border-t border-ink-700 pt-6" aria-live="polite">
      <div>
        <p className="kicker text-ink-400">MUSD saved on Mezo through Reach (live)</p>
        <p className="num mt-1 text-[2.25rem] font-semibold leading-none tracking-[-0.03em] text-bone-50">
          {value === null ? "…" : value.toLocaleString("en-US", { maximumFractionDigits: 2 })}
          <span className="ml-2 text-base font-normal text-ink-300">MUSD</span>
        </p>
      </div>
      <p className="max-w-md text-sm text-ink-300">
        Principal plus yield held by the Reach wrapper in Mezo&apos;s Savings Vault on Mezo testnet, read from the chain in your browser
        {d ? (
          <>
            {" "}(<a className="underline underline-offset-4" href={`${reachConfig.mezo.explorer}/address/${d.wrapper}`} target="_blank" rel="noreferrer">wrapper</a>).
          </>
        ) : (
          "."
        )}
      </p>
    </div>
  );
}
