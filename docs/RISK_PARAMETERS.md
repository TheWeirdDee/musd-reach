# Risk parameters, from MUSD's own price history

Both Reach markets use the same three numbers. This page shows where they come from, using MUSD's full trading history and one script anyone can re-run:

```bash
node analysis/musd-risk.mjs            # uses analysis/data/musd_daily.csv
node analysis/musd-risk.mjs --fetch    # refreshes the data from DefiLlama first (free, no key)
```

## The parameters

| Setting | Value | Why |
|---|---|---|
| Liquidation LLTV | **77%** | An LLTV Morpho Blue already enables on Base. With the haircut, the largest loan at opening is 69.3% of the savings value. |
| NAV haircut | **10%** | The oracle values rwSMUSD at 90% of its attested savings value. In the USDC market this is **5.7×** MUSD's worst recorded depeg. In the MUSD market it covers a Savings Vault shortfall and a liquidator's exit time. |
| NAV maximum age | **72 hours** | Borrowing stops if the attested NAV is older than this. A scheduled keeper checks every 12 hours and refreshes any NAV older than 20 hours, so it normally stays under a day old. |

## The data

MUSD's daily price from DefiLlama's stablecoin API (series `mezo-usd`), **424 days** from 13 September 2025 to 11 November 2026, saved in [`analysis/data/musd_daily.csv`](../analysis/data/musd_daily.csv).

## What the price history says

Output of `node analysis/musd-risk.mjs` on 11 November 2026:

```text
1. How far below $1 MUSD has traded (daily price)
   lowest: $0.9823 on 2025-09-28 (a 1.77% discount)
   highest: $1.0495 on 2025-10-08
   discount percentiles: 50th 0.82%, 95th 1.27%, 99th 1.53%, worst 1.77%
   days below $0.99: 99 of 424
   days below $0.98: 0 of 424
   days below $0.95: 0 of 424
   days below $0.90: 0 of 424

2. Fastest falls below $1 (from $1, or the day's price if lower, to the lowest of the next N days)
    1 day : 0.97%  (2025-09-24 → 2025-09-25)
    3 days: 1.57%  (2025-09-24 → 2025-09-27)   ← the oracle's 72-hour NAV window
    7 days: 1.72%  (2025-09-24 → 2025-09-28)
   30 days: 1.77%  (2025-09-13 → 2025-09-28)

3. What the deployed parameters tolerate
   LLTV 77%, haircut 10%, NAV max age 72 h → largest loan at opening: 69.3% of NAV
   USDC market (MUSD-valued collateral, USDC debt; the oracle values MUSD at $1):
     a maximum loan reaches the liquidation line in real dollars only after a 10.0% MUSD depeg
     and lenders lose money only after a 30.7% depeg
     worst observed depeg: 1.77%  → 5.7x headroom to the line, 17.4x to a lender loss
   MUSD market (MUSD-valued collateral, MUSD debt):
     both sides are MUSD, so a depeg moves them together and cannot push a loan toward liquidation;
     the 10% haircut instead covers a Savings Vault shortfall and the time a liquidator needs to exit through Mezo
   NAV age: the savings NAV only rises while the vault is solvent (yield accrues), so a stale NAV
     undervalues collateral; the 72-hour bound stops borrowing on a NAV that could hide a vault loss.
```

## Reading the results

- **MUSD has never closed a day below $0.98.** Its worst daily discount was 1.77%, and the worst fall below $1 inside any 72-hour window was 1.57%. The haircut absorbs a 10% depeg before a maximum loan reaches the liquidation line in real dollars.
- **The MUSD market carries almost no price risk.** The collateral (a claim on MUSD savings) and the debt (MUSD) are both MUSD, so a depeg cannot push a loan toward liquidation. That is why Reach leads with the MUSD market: the remaining risks are the Savings Vault itself and the time a liquidator needs to exit through Mezo, and the haircut is sized for those.
- **A stale NAV errs on the safe side.** While the vault is solvent, the savings NAV only rises, because yield accrues to it. An old NAV therefore undervalues collateral. The 72-hour bound exists so that a loss in the vault cannot hide behind an old snapshot; past that age, new borrowing stops automatically.
- **Liquidation is an exit through Mezo.** A liquidator receives rwSMUSD, burns it on Base and receives MUSD on Mezo once the guardian-signed message arrives. Mezo's Savings Vault has no withdrawal timelock and no withdrawal fee ([Mezo](https://mezo.org/blog/earn-stablecoin-yield-with-the-musd-savings-vault)), so the exit time is the messaging time. On 11 November 2026, Wormhole testnet paused signing Mezo messages for more than two hours; the haircut and the 72-hour window are sized to ride out delays of that kind.

## Limits of this study

- **424 days is a short record.** MUSD has not yet been through a deep Bitcoin crash. The study should be re-run before mainnet and the haircut raised if a new history demands it.
- **MUSD on other chains adds bridge risk.** Yearn's [curation report on MUSD](https://curation.yearn.fi/report/mezo-musd/) notes that MUSD outside Mezo depends on Wormhole NTT, and MUSD itself on tBTC. Reach's markets on Base inherit both.
- **Liquidation on testnet** relies on any participant calling Morpho Blue's permissionless `liquidate`. Liquidation after an impaired NAV is proven on a Base mainnet fork ([`MorphoCompatibilityFork.t.sol`](../packages/contracts/test/fork/MorphoCompatibilityFork.t.sol)).
