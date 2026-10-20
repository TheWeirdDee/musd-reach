import { formatUnits } from "viem";

/** Exact decimal string of a base-unit amount (no floating point). */
export const toDecimal = (v: bigint, decimals = 18) => formatUnits(v, decimals);

/** Display formatting that truncates (never rounds up) to `places` fractional digits. */
export function formatAmount(v: bigint, decimals = 18, places = 4): string {
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  let frac = (abs % base).toString().padStart(decimals, "0").slice(0, places);
  frac = frac.replace(/0+$/, "");
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}${wholeStr}${frac ? `.${frac}` : ""}`;
}

/** Parses a user-entered decimal string into base units; rejects excess precision. */
export function parseAmount(input: string, decimals = 18): bigint {
  const s = input.trim().replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error("Enter a positive number");
  const [w, f = ""] = s.split(".");
  if (f.length > decimals) throw new Error(`At most ${decimals} decimal places`);
  return BigInt(w!) * 10n ** BigInt(decimals) + BigInt((f + "0".repeat(decimals)).slice(0, decimals));
}

export const shortHex = (h: string, head = 6, tail = 4) => (h.length <= head + tail + 2 ? h : `${h.slice(0, head + 2)}…${h.slice(-tail)}`);
