# Business model

MUSD Reach turns Mezo savings into collateral on Base. Savers keep earning on Mezo and borrow MUSD or USDC on Base. Lenders earn the interest those savers pay. Reach takes 10% of that interest and charges nothing else.

Every number below is read from Mezo mainnet and Morpho's public API by one script, [`analysis/market-data.mjs`](../analysis/market-data.mjs). Its dated output is [`analysis/data/market-snapshot.json`](../analysis/data/market-snapshot.json). Run `node analysis/market-data.mjs` to refresh it.

## Who it's for

Reach is a market between two groups:

- **Savers who need liquidity.** MUSD holders who want the Savings Vault rate on Mezo and still need dollars to use on Base. They borrow against their savings instead of withdrawing them.
- **Lenders who want yield backed by Mezo savings.** Holders of MUSD or USDC on Base who want interest from loans collateralized by MUSD locked in Mezo's own vault.

Savers save in MUSD. Lenders lend, and savers borrow, in **MUSD or USDC**: one Morpho market and one Reach vault for each.

## The numbers that decide it

Read on 12 November 2026.

| | Value | Source |
|---|---|---|
| MUSD issued | **18,994,150** | MUSD `totalSupply`, Mezo mainnet |
| MUSD in the Savings Vault | **1,325,391** (7.0%) | sMUSD `totalSupply` |
| Saved MUSD, May to October | 5.6M to 7.5M | sMUSD `totalSupply` at past blocks |
| What happened on 5 November | One Mezo contract withdrew **5.25M**, about 71% of all savings | [tx 0x700d…6605](https://explorer.mezo.org/tx/0x700d3236668334b91299d3ea1bd7252fcdd941a02869589fc78b8ab1f1816605): Mezo's `VaultGauge` → its `Enclave` contract |
| Savings rate actually paid | **14.56%** last 7 days · **5.38%** last 30 · **3.54%** last 90 · **2.84%** last 6 months | Growth of the vault's `yieldIndex` |
| MUSD fees paid to savers | **≈ $336k a year** | Day-by-day sum over the last 30 days, annualized |
| MEZO rewards for staked sMUSD | 69,606 MEZO a day to 153,031 staked sMUSD (≈ 69% a year at $0.0042), **instead of** the savings yield: the gauge sends the MUSD yield of staked sMUSD to veBTC voters | Mezo's sMUSD `VaultGauge` (`_claimFees`); this reward period ends 19 Nov |
| Morpho on Base | 94 listed markets, **$2.24B** borrowed | Morpho API |
| Cost to borrow USDC on Base | **5.29%** (lenders earn **4.50%**) | Morpho API, weighted by size |

Two facts follow from this table. Mezo pays savers from a **pool of fees**, about $336k a year, shared by everyone saved. So the savings rate is that pool divided by the amount saved. When savers leave, the rate rises: it jumped to 14.56% after 5 November.

## When borrowing against savings pays

Compare two choices for a saver who needs dollars:

- **Keep the savings and borrow** against them through Reach.
- **Withdraw** the same amount from the Savings Vault.

The savings earn the same in both cases except on the amount borrowed. So the difference is:

> **net = amount borrowed × (savings rate − borrow rate) × time**

Borrowing comes out ahead whenever the savings rate is above the borrow rate. A saver with 1,000 MUSD saved who borrows 500 for 30 days at today's 5.29% borrow rate:

| Savings rate used | Savings rate | Net versus withdrawing |
|---|---|---|
| Last 7 days | 14.56% | **+3.81 MUSD** |
| Last 30 days | 5.38% | +0.04 MUSD |
| Last 90 days | 3.54% | −0.72 MUSD |

So today borrowing against savings pays. In a calm quarter it costs a little, and the saver pays that small amount to keep the savings position open. The [calculator on the site](https://musd-reach.vercel.app/app/borrow) runs the same arithmetic with any amounts and rates.

**The market settles itself.** If the fee pool holds, the savings rate meets the 5.29% borrow rate when about **6.36M MUSD** is saved ($336k ÷ 5.29%). Today 1.33M is saved. Until savings reach that level, saving and borrowing against it is the better deal. Each saver who does it adds MUSD to Mezo's vault, which pulls the rate back toward balance. Reach grows Mezo's savings in exactly the range where using it pays.

## Who pays, for what

| Who | Pays | When |
|---|---|---|
| A saver who borrows | Interest at the market's adaptive rate (Morpho's adaptive curve) | While the loan is open; repay at any time |
| Reach's share | **10% of that interest**, minted as vault shares to the Reach treasury | Continuously, as each vault accrues interest |
| Everyone else | **Nothing.** Making savings portable, transferring rwSMUSD, bridging MUSD on Mezo's bridge, depositing, withdrawing and redeeming to Mezo cost only network gas | — |

There is no other fee. A saver who never borrows pays nothing, and lenders keep 90% of the interest their deposits earn. The fee is **live on Base Sepolia** in both Reach vaults.

## Revenue, honestly

At today's savings size, Reach's fee is small. Assume savers use half of their borrowing room (69.3% of savings at opening) at 5.29%:

| Share of today's 1.33M saved MUSD made portable | Borrowed | Interest a year | Reach (10%) a year |
|---|---|---|---|
| 10% | $45.9k | $2.4k | **$243** |
| 25% | $114.8k | $6.1k | **$607** |
| 50% | $229.6k | $12.1k | **$1.2k** |

That covers Reach's running costs: the NAV keeper spends cents of gas a day, and the site and API run on free tiers. It does not pay a team. At a 5.29% borrow rate, **$100k a year of fees needs about $19M of loans**, which needs Mezo savings several times today's size. Reach grows on three lines, in this order:

1. **Savings back toward balance.** Up to the ≈ 6.36M MUSD balance point, saving and borrowing against it beats withdrawing, as shown above. Savings sat at 7.4M for most of 2026.
2. **Curating MUSD on Base.** The Reach MUSD Vault is a Morpho Vault V2 and can add other Base markets through adapters. The same 10% fee then applies to all MUSD lent through Reach on Base, not only to loans against rwSMUSD. Mezo is moving MUSD to Base on its own bridge, and those holders need somewhere to earn. On 12 Nov, none of Morpho's 94 listed Base markets lent or accepted MUSD.
3. **Liquidations.** At a 77% LLTV, Morpho pays liquidators about 7.4% of the debt they repay. Reach runs a liquidator for its own markets. This earns only when loans fail, so it is never counted on.

## Gaps we know about, and how we close them

| Gap | What it means | How it closes |
|---|---|---|
| **Choosing Mezo's better yield** | Mezo pays an sMUSD holder one of two things: the MUSD savings yield, or, if the sMUSD is staked in its `VaultGauge`, MEZO emissions instead (the gauge sends staked sMUSD's savings yield to veBTC voters). The deployed testnet wrapper can only earn the savings yield. | **Built and tested:** [`ReachSavingsWrapperV3`](../packages/contracts/src/mezo/ReachSavingsWrapperV3.sol) lets the guardian switch the wrapper's savings into the gauge when MEZO pays more, and back. Exits unstake exactly what they need and can never be paused; MEZO goes only to a rewards distributor for holders. Tested against Mezo **mainnet's** live gauge on a local fork (real MEZO earned and claimed). It ships with the mainnet launch, because Mezo testnet has no gauge and the deployed testnet contracts cannot be changed. One open item: Mezo's main pool factory has no MEZO/MUSD pool today, so MEZO is passed to holders as MEZO rather than swapped into the share price. |
| **Concentrated savings** | One contract held 71% of all savings and left in a day. The savings rate swings with moves like that. | The calculator shows the rate over 7, 30, 90 and 180 days, not one flattering figure. Borrowers can repay at any time. |
| **Rates move** | Today's advantage can vanish as savings return. | Covered above: the market settles itself, and the saver sees the trade before borrowing. |
| **Scale** | The fee needs a much larger Mezo to pay a team. | The three revenue lines above, and MEZO incentives to bootstrap lenders (go-to-market, below). |

## A worked example

A saver has **1,000 MUSD** saved on Mezo through Reach and holds the matching rwSMUSD on Base. They borrow **500 MUSD for 30 days**. Rates are Mezo's 30-day savings rate (5.38%) and Morpho's USDC borrow rate on Base (5.29%).

| | Amount |
|---|---|
| Largest loan at opening (69.3% of the savings, see [risk parameters](RISK_PARAMETERS.md)) | 693 MUSD |
| The 1,000 MUSD keeps earning on Mezo | +4.42 MUSD |
| Interest on 500 MUSD | −2.17 MUSD |
| Of which lenders receive (90%) | 1.96 MUSD |
| Of which **Reach receives (10%)** | **0.22 MUSD** |
| Had they withdrawn 500 instead, the other 500 would have earned | 2.21 MUSD |
| **Borrowing versus withdrawing** | **+0.04 MUSD** |

At the 7-day savings rate the same loan comes out **3.81 MUSD** ahead. At the 90-day rate it costs 0.72 MUSD.

## Why it grows Mezo

- Every rwSMUSD is backed by MUSD deposited in **Mezo's own Savings Vault**. More borrowing demand on Base means more MUSD saved on Mezo.
- Today 1.33M of 19.0M MUSD (7%) is saved, down from 7.4M before 5 November. Reach gives savers a reason to come back while the rate is high.
- The MUSD market keeps the whole loop in MUSD: borrowed MUSD goes home on Mezo's bridge and can be saved again.
- MUSD lent on Base through Reach is MUSD that Mezo's bridge moved there, put to work against Mezo collateral.

## What keeps it safe enough to grow

The 77% LLTV, the 10% haircut and the 72-hour NAV limit come from MUSD's own price history. Across 424 days MUSD never closed below $0.98. That leaves 5.7× headroom before a maximum USDC loan reaches its liquidation line ([risk parameters](RISK_PARAMETERS.md), re-runnable with `node analysis/musd-risk.mjs`). The MUSD market carries almost no price risk, because collateral and debt are both MUSD.

## Go-to-market

1. **Lenders on Base first.** A market needs dollars to lend before savers can borrow. MUSD holders on Base and USDC lenders get 90% of the interest, on loans backed by Mezo savings. Today 600 MUSD has been moved to Base over Mezo's bridge for testing, and 250 MUSD is lent in the Reach MUSD Vault.
2. **Savers, with the arithmetic up front.** The calculator shows a saver what borrowing against savings earns or costs before they connect a wallet. On testnet, a free 50 MUSD starter kit lets anyone try the whole loop.
3. **MEZO incentives.** Mezo already pays 69,606 MEZO a day to sMUSD stakers through a gauge. We will propose a gauge share for Reach lenders and rwSMUSD to bootstrap liquidity, the way Mezo bootstraps its own pools.
4. **Base integrations.** List rwSMUSD as collateral beyond the Reach vaults, using the same oracle and keeper.

## Milestones

| When | Milestone |
|---|---|
| **Done (Nov 2026)** | Two live Morpho markets on Base Sepolia (MUSD and USDC), verified NAV oracle, keeper, 10% fee, Mezo bridge integration, starter kit, Mezo mainnet fork tests, market data study |
| Q4 2026 | Outside testers through both markets; re-run the risk and market studies on new data |
| Q1 2027 | External audit of the wrapper (including the gauge-mode V3), gateways and NAV oracle; MEZO rewards distributor for holders |
| Q2 2027 | Capped mainnet launch: Mezo mainnet ↔ Base, MUSD market first, conservative caps |
| Q3 2027 | MEZO gauge proposal; the Reach MUSD Vault adds other Base MUSD markets |
