import siteData from "@/generated/site-data.json";

/** Dated market data written by `node analysis/market-data.mjs` (Mezo mainnet + Morpho on Base). */
export type MarketSnapshot = {
  asOf: string;
  mezoBlock: number;
  savings: {
    saved: number;
    musdSupply: number;
    rates: { days: number; from: string; savedAtStart: number; rate: number }[];
    yieldPoolAnnualized30d: number;
    history: { date: string; saved: number }[];
  };
  gauge: { mezoPerDay: number; stakedSmusd: number; periodFinish: string; mezoPrice: number | null; rewardRate: number | null };
  morphoBase: { listedMarkets: number; borrowedUsd: number; usdcBorrowedUsd: number; usdcBorrowRate: number; usdcSupplyRate: number; musdMarkets: number };
};

export const snapshot: MarketSnapshot | null = (siteData as unknown as { marketSnapshot?: MarketSnapshot | null }).marketSnapshot ?? null;

/** Largest loan at opening, as a share of the savings: 77% LLTV x (1 - 10% haircut). */
export const MAX_BORROW_SHARE = 0.77 * 0.9;
/** Reach's share of the interest borrowers pay (vault performance fee). */
export const REACH_FEE = 0.1;

/** Savings rate measured over the window closest to `days` (7, 30, 90 or 180). */
export function savingsRate(s: MarketSnapshot, days: number) {
  return s.savings.rates.reduce((best, r) => (Math.abs(r.days - days) < Math.abs(best.days - days) ? r : best), s.savings.rates[0]);
}

/**
 * What borrowing against savings costs or earns, compared with withdrawing the same amount instead.
 * Keeping the savings and borrowing earns `saved x rs` and costs `borrowed x rb`; withdrawing the
 * borrowed amount earns `(saved - borrowed) x rs`. The difference is `borrowed x (rs - rb)`.
 */
export function borrowVsWithdraw({ saved, borrowed, days, savingsRate: rs, borrowRate: rb }: { saved: number; borrowed: number; days: number; savingsRate: number; borrowRate: number }) {
  const t = days / 365;
  const savingsEarned = saved * rs * t;
  const interest = borrowed * rb * t;
  return {
    savingsEarned,
    interest,
    reach: interest * REACH_FEE,
    lenders: interest * (1 - REACH_FEE),
    withdrawInstead: (saved - borrowed) * rs * t,
    net: borrowed * (rs - rb) * t,
  };
}

/** Amount saved at which the savings rate falls to `borrowRate`, if the fee pool savers share holds. */
export const breakEvenSaved = (s: MarketSnapshot, borrowRate: number) => s.savings.yieldPoolAnnualized30d / borrowRate;
