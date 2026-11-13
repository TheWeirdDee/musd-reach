// MUSD Reach risk parameters from MUSD's own price history.
//
//   node analysis/musd-risk.mjs            # uses analysis/data/musd_daily.csv
//   node analysis/musd-risk.mjs --fetch    # refreshes the CSV from DefiLlama first (free, no key)
//
// Source: DefiLlama stablecoin prices (https://stablecoins.llama.fi/stablecoinprices), series
// "mezo-usd" (Mezo USD, MUSD), one price per UTC day. The output of this script is pasted into
// docs/RISK_PARAMETERS.md.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const csvPath = join(here, "data", "musd_daily.csv");

// Deployed market parameters (deployments/testnet-markets*.json).
const LLTV = 0.77;
const HAIRCUT = 0.1;
const NAV_MAX_AGE_H = 72;

async function fetchSeries() {
  const res = await fetch("https://stablecoins.llama.fi/stablecoinprices");
  if (!res.ok) throw new Error(`DefiLlama HTTP ${res.status}`);
  const rows = (await res.json())
    .filter((d) => d.prices && d.prices["mezo-usd"] != null)
    .map((d) => [new Date(d.date * 1000).toISOString().slice(0, 10), Number(d.prices["mezo-usd"])]);
  mkdirSync(dirname(csvPath), { recursive: true });
  writeFileSync(csvPath, "date,price_usd\n" + rows.map((r) => r.join(",")).join("\n") + "\n");
  return rows;
}

function readSeries() {
  return readFileSync(csvPath, "utf8")
    .trim()
    .split("\n")
    .slice(1)
    .map((l) => {
      const [d, p] = l.split(",");
      return [d, Number(p)];
    });
}

const pctl = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
const f = (x, d = 2) => (x * 100).toFixed(d) + "%";

const rows = process.argv.includes("--fetch") || !existsSync(csvPath) ? await fetchSeries() : readSeries();
const prices = rows.map((r) => r[1]);
const n = prices.length;

console.log(`MUSD daily prices: ${n} days, ${rows[0][0]} to ${rows[n - 1][0]} (DefiLlama "mezo-usd")\n`);

// 1. Depeg below $1
const minIdx = prices.indexOf(Math.min(...prices));
const maxIdx = prices.indexOf(Math.max(...prices));
const below = (t) => prices.filter((p) => p < t).length;
const discounts = prices.map((p) => Math.max(0, 1 - p)).sort((a, b) => a - b);
console.log("1. How far below $1 MUSD has traded (daily price)");
console.log(`   lowest: $${prices[minIdx].toFixed(4)} on ${rows[minIdx][0]} (a ${f(1 - prices[minIdx])} discount)`);
console.log(`   highest: $${prices[maxIdx].toFixed(4)} on ${rows[maxIdx][0]}`);
console.log(`   discount percentiles: 50th ${f(pctl(discounts, 0.5))}, 95th ${f(pctl(discounts, 0.95))}, 99th ${f(pctl(discounts, 0.99))}, worst ${f(discounts[n - 1])}`);
for (const t of [0.99, 0.98, 0.95, 0.9]) console.log(`   days below $${t.toFixed(2)}: ${below(t)} of ${n}`);

// 2. Fastest falls below $1. The oracle values MUSD at $1, so a fall from a premium back to $1
//    is not a risk: each window starts from $1, or from the day's price if it is already lower.
console.log("\n2. Fastest falls below $1 (from $1, or the day's price if lower, to the lowest of the next N days)");
for (const N of [1, 3, 7, 30]) {
  let worst = 0, at = "";
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j <= Math.min(n - 1, i + N); j++) {
      const drop = Math.max(0, 1 - prices[j] / Math.min(1, prices[i]));
      if (drop > worst) { worst = drop; at = `${rows[i][0]} → ${rows[j][0]}`; }
    }
  }
  console.log(`   ${String(N).padStart(2)} day${N > 1 ? "s" : " "}: ${f(worst)}  (${at || "never fell"})${N === 3 ? "   ← the oracle's 72-hour NAV window" : ""}`);
}

// 3. What the deployed parameters tolerate
const maxLtvAtOpen = (1 - HAIRCUT) * LLTV;
const depegToLltv = 1 - maxLtvAtOpen / LLTV; // a max-LTV loan reaches LLTV in true dollar terms
const depegToBadDebt = 1 - maxLtvAtOpen; // collateral worth less than the debt
const worst = discounts[n - 1];
console.log("\n3. What the deployed parameters tolerate");
console.log(`   LLTV ${f(LLTV, 0)}, haircut ${f(HAIRCUT, 0)}, NAV max age ${NAV_MAX_AGE_H} h → largest loan at opening: ${f(maxLtvAtOpen, 1)} of NAV`);
console.log("   USDC market (MUSD-valued collateral, USDC debt; the oracle values MUSD at $1):");
console.log(`     a maximum loan reaches the liquidation line in real dollars only after a ${f(depegToLltv, 1)} MUSD depeg`);
console.log(`     and lenders lose money only after a ${f(depegToBadDebt, 1)} depeg`);
console.log(`     worst observed depeg: ${f(worst)}  → ${(depegToLltv / worst).toFixed(1)}x headroom to the line, ${(depegToBadDebt / worst).toFixed(1)}x to a lender loss`);
console.log("   MUSD market (MUSD-valued collateral, MUSD debt):");
console.log("     both sides are MUSD, so a depeg moves them together and cannot push a loan toward liquidation;");
console.log(`     the ${f(HAIRCUT, 0)} haircut instead covers a Savings Vault shortfall and the time a liquidator needs to exit through Mezo`);
console.log("   NAV age: the savings NAV only rises while the vault is solvent (yield accrues), so a stale NAV");
console.log("     undervalues collateral; the 72-hour bound stops borrowing on a NAV that could hide a vault loss.");
