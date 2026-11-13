// MUSD Reach market data: the numbers behind docs/BUSINESS_MODEL.md, read from public sources.
//
//   node analysis/market-data.mjs    # prints the report and writes analysis/data/market-snapshot.json
//
// Sources (all free, no key):
//   - Mezo mainnet RPC (https://mezo-mainnet.boar.network): the MUSD Savings Vault (sMUSD) and its
//     MEZO reward gauge, read directly from the contracts, including at past blocks.
//   - DefiLlama coin prices (https://coins.llama.fi): the MEZO price.
//   - Morpho's public API (https://blue-api.morpho.org/graphql): every listed Morpho market on Base.
//
// How the savings rate is measured: the vault is not ERC-4626. It keeps a global `yieldIndex`, the
// MUSD of yield paid per 1 sMUSD since launch (scaled by 1e18). The rate over a window is
//   (index_now - index_then) / 1e18 * 365 / days,
// which is exactly what a saver who held through the window was paid, annualized.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outPath = join(here, "data", "market-snapshot.json");

const RPC = "https://mezo-mainnet.boar.network";
const MUSD = "0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186";
const SAVINGS = "0xb4D498029af77680cD1eF828b967f010d06C51CC"; // sMUSD, Mezo's MUSD Savings Vault
const GAUGE = "0x677817bF3e44b90E8F95222F75e2950b7904a401"; // VaultGauge: stake sMUSD, earn MEZO
const SEL = { yieldIndex: "0xfae47729", totalSupply: "0x18160ddd", rewardRate: "0x7b0a47ee", periodFinish: "0xebe2b12b" };

// Reach settings used in the scenarios (deployments/testnet-markets*.json, docs/RISK_PARAMETERS.md).
const REACH_FEE = 0.1;
const MAX_BORROW = 0.693; // 77% LLTV x (1 - 10% haircut)

let id = 0;
async function rpc(method, params) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }) });
      const j = await res.json();
      if (j.error) throw new Error(j.error.message);
      return j.result;
    } catch (e) {
      if (attempt >= 3) throw e;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
}
const call = async (to, data, block = "latest") => BigInt(await rpc("eth_call", [{ to, data }, block]));
const hex = (n) => "0x" + n.toString(16);
const units = (v) => Number(v) / 1e18;

// ---- 1. Mezo Savings Vault: rate and size over time ----------------------------------------
const head = await rpc("eth_getBlockByNumber", ["latest", false]);
const headN = BigInt(head.number);
const headT = Number(BigInt(head.timestamp));
const back = await rpc("eth_getBlockByNumber", [hex(headN - 100000n), false]);
const blockTime = (headT - Number(BigInt(back.timestamp))) / 100000;

async function sample(daysAgo) {
  const bn = headN - BigInt(Math.round((daysAgo * 86400) / blockTime));
  const tag = hex(bn);
  const [b, index, saved] = await Promise.all([rpc("eth_getBlockByNumber", [tag, false]), call(SAVINGS, SEL.yieldIndex, tag), call(SAVINGS, SEL.totalSupply, tag)]);
  return { date: new Date(Number(BigInt(b.timestamp)) * 1000).toISOString().slice(0, 10), t: Number(BigInt(b.timestamp)), index, saved: units(saved) };
}

const now = await sample(0);
const windows = [];
for (const d of [7, 30, 90, 180]) {
  const then = await sample(d);
  const days = (now.t - then.t) / 86400;
  const perToken = units(now.index - then.index); // MUSD paid per 1 sMUSD over the window
  windows.push({ days: Math.round(days), from: then.date, savedAtStart: then.saved, rate: (perToken * 365) / days });
}
const history = [];
for (const d of [0, 7, 14, 30, 60, 90, 120, 150, 180]) {
  const s = d === 0 ? now : await sample(d);
  history.push({ date: s.date, saved: Math.round(s.saved) });
}
const musdSupply = units(await call(MUSD, SEL.totalSupply));

// Yield paid to all savers over the last 30 days, annualized: the "fee pool" savers share.
// Summed day by day (index growth that day x MUSD saved that day), so a large deposit or exit
// inside the window is counted. Yield arrives in lumps, so shorter windows are too noisy to use.
const daily = [];
for (let d = 30; d >= 1; d--) daily.push(await sample(d));
daily.push(now);
let paid30 = 0;
for (let i = 0; i < daily.length - 1; i++) paid30 += units(daily[i + 1].index - daily[i].index) * daily[i].saved;
const pool30 = (paid30 * 365) / (daily.length - 1);

// ---- 2. MEZO reward gauge for sMUSD ----------------------------------------------------------
const [rewardRate, staked, periodFinish] = await Promise.all([call(GAUGE, SEL.rewardRate), call(GAUGE, SEL.totalSupply), call(GAUGE, SEL.periodFinish)]);
let mezoPrice = null;
try {
  const p = await (await fetch("https://coins.llama.fi/prices/current/coingecko:mezo")).json();
  mezoPrice = p.coins["coingecko:mezo"]?.price ?? null;
} catch {}
const mezoPerDay = units(rewardRate * 86400n);
const gauge = {
  mezoPerDay,
  stakedSmusd: units(staked),
  periodFinish: new Date(Number(periodFinish) * 1000).toISOString().slice(0, 10),
  mezoPrice,
  rewardRate: mezoPrice ? (mezoPerDay * mezoPrice * 365) / units(staked) : null,
};

// ---- 3. Morpho on Base (chain 8453), listed markets ------------------------------------------
const q = `{ markets(first: 500, where: { chainId_in: [8453], listed: true }) { items { loanAsset { symbol } collateralAsset { symbol } state { borrowAssetsUsd supplyAssetsUsd borrowApy supplyApy } } } }`;
const mj = await (await fetch("https://blue-api.morpho.org/graphql", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: q }) })).json();
if (!mj.data) throw new Error("Morpho API: " + JSON.stringify(mj).slice(0, 300));
const markets = mj.data.markets.items.filter((m) => m.collateralAsset);
const sum = (xs, f) => xs.reduce((s, m) => s + (f(m) || 0), 0);
const usdc = markets.filter((m) => m.loanAsset.symbol === "USDC" && m.state.borrowAssetsUsd > 0);
const usdcBorrowed = sum(usdc, (m) => m.state.borrowAssetsUsd);
const morpho = {
  listedMarkets: markets.length,
  borrowedUsd: sum(markets, (m) => m.state.borrowAssetsUsd),
  usdcBorrowedUsd: usdcBorrowed,
  usdcBorrowRate: sum(usdc, (m) => m.state.borrowApy * m.state.borrowAssetsUsd) / usdcBorrowed,
  usdcSupplyRate: sum(usdc, (m) => m.state.supplyApy * m.state.supplyAssetsUsd) / sum(usdc, (m) => m.state.supplyAssetsUsd),
  musdMarkets: markets.filter((m) => /MUSD/i.test(m.loanAsset.symbol + " " + m.collateralAsset.symbol)).length,
};

// ---- 4. What it means for a saver and for Reach -----------------------------------------------
const rb = morpho.usdcBorrowRate;
const saverCases = windows.slice(0, 3).map((w) => {
  const borrowed = 500, days = 30;
  return { savingsWindowDays: w.days, savingsRate: w.rate, borrowRate: rb, netMusd: (borrowed * (w.rate - rb) * days) / 365 };
});
const revenue = [0.1, 0.25, 0.5].map((share) => {
  const portable = now.saved * share, borrowed = portable * MAX_BORROW * 0.5;
  return { share, portable, borrowed, interest: borrowed * rb, reach: borrowed * rb * REACH_FEE };
});

// ---- Report --------------------------------------------------------------------------------
const pct = (x) => (x * 100).toFixed(2) + "%";
const usd = (x) => "$" + (x >= 1e6 ? (x / 1e6).toFixed(2) + "M" : x >= 1e3 ? (x / 1e3).toFixed(1) + "k" : x.toFixed(0));
console.log(`MUSD Reach market data, ${now.date} (Mezo mainnet block ${headN})\n`);
console.log("1. Mezo Savings Vault (sMUSD)");
console.log(`   MUSD saved now: ${Math.round(now.saved).toLocaleString("en-US")} of ${Math.round(musdSupply).toLocaleString("en-US")} MUSD issued (${pct(now.saved / musdSupply)})`);
for (const w of windows) console.log(`   rate paid over the last ${String(w.days).padStart(3)} days (from ${w.from}): ${pct(w.rate)} a year   (saved at start: ${Math.round(w.savedAtStart).toLocaleString("en-US")})`);
console.log(`   MUSD paid to all savers, summed daily over the last 30 days and annualized: ${usd(pool30)} a year`);
console.log(`   if that pool holds, the savings rate at a given amount saved is pool / saved: ${[1.33e6, 3e6, 7.4e6].map((s) => `${usd(s)} saved -> ${pct(pool30 / s)}`).join(", ")}`);
console.log("   saved over time: " + history.map((h) => `${h.date} ${(h.saved / 1e6).toFixed(2)}M`).join(", "));
console.log("\n2. MEZO rewards for staked sMUSD (VaultGauge)");
console.log(`   ${Math.round(gauge.mezoPerDay).toLocaleString("en-US")} MEZO a day to ${Math.round(gauge.stakedSmusd).toLocaleString("en-US")} staked sMUSD, current period ends ${gauge.periodFinish}`);
if (gauge.rewardRate != null) console.log(`   at MEZO $${gauge.mezoPrice.toFixed(4)}: ${pct(gauge.rewardRate)} a year, instead of the savings rate (the gauge sends staked sMUSD's MUSD yield to veBTC voters)`);
console.log("\n3. Morpho on Base (listed markets)");
console.log(`   ${morpho.listedMarkets} markets, ${usd(morpho.borrowedUsd)} borrowed; USDC loans ${usd(morpho.usdcBorrowedUsd)}`);
console.log(`   USDC borrow rate (weighted by size): ${pct(morpho.usdcBorrowRate)}; USDC lender rate: ${pct(morpho.usdcSupplyRate)}`);
console.log(`   listed markets that lend or accept MUSD: ${morpho.musdMarkets}`);
console.log("\n4. A saver borrows 500 against savings for 30 days (net = 500 x (savings rate - borrow rate) x 30/365)");
for (const c of saverCases) console.log(`   savings at the ${String(c.savingsWindowDays).padStart(2)}-day rate ${pct(c.savingsRate)} vs borrow ${pct(c.borrowRate)}: ${c.netMusd >= 0 ? "+" : ""}${c.netMusd.toFixed(2)} MUSD`);
console.log("\n5. Reach revenue at today's savings size (half of the borrowing room used, 10% of interest)");
for (const r of revenue) console.log(`   ${String(r.share * 100).padStart(2)}% of savings portable: ${usd(r.portable)} portable, ${usd(r.borrowed)} borrowed, ${usd(r.interest)} interest a year, Reach ${usd(r.reach)}`);

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(
  outPath,
  JSON.stringify(
    {
      asOf: now.date,
      mezoBlock: Number(headN),
      sources: { mezoRpc: RPC, savingsVault: SAVINGS, gauge: GAUGE, mezoPrice: "coins.llama.fi coingecko:mezo", morpho: "blue-api.morpho.org (chainId 8453, listed)" },
      savings: { saved: now.saved, musdSupply, rates: windows, yieldPoolAnnualized30d: pool30, history },
      gauge,
      morphoBase: morpho,
      saverCases,
      revenue,
    },
    null,
    2,
  ) + "\n",
);
console.log(`\nwrote ${outPath}`);
