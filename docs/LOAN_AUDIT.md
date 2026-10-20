# Testnet MUSD loan: audit and repayment plan

Read-only audit on 20 October 2026 of the primary wallet `0x0F579957D94D1D12Fbb0dE3A495180629098Efe6` on Mezo testnet. **No repayment has been executed.**

## Contracts (testnet, discovered on-chain)

| Contract | Address | How identified |
|---|---|---|
| BorrowerOperations (proxy) | `0xCdF7028ceAB81fA0C6971208e83fa7872994beE5` | Target of a recent `openTrove` that minted MUSD |
| BorrowerOperations implementation | `0xc05Bf344BD5b58825784326dD3112fB6cC160dcC` | Blockscout-verified source, solc 0.8.24 |
| TroveManager (proxy) | `0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0` | `BorrowerOperations.troveManager()` |
| SortedTroves | `0x722E4D24FD6Ff8b0AC679450F3D91294607268fA` | `troveManager.sortedTroves()` |
| PriceFeed | `0x86bCF0841622a5dAC14A313a15f96A95421b9366` | `BorrowerOperations.priceFeed()` |

## Position at read time

| Item | Value | Source |
|---|---|---|
| Opened by | tx `0x3885955be521da63828d6e392136a365069a9de97bce99daf849755acee4b868` | Mezo block 16263461 |
| Status | 1 (active) | `getTroveStatus` |
| Collateral | 0.04 BTC (4e16) | `getTroveColl` |
| Principal | 2,001.8 MUSD: 1,800 requested + 200 gas reserve + 1.8 borrowing fee (0.1%) | `getTrovePrincipal` |
| Accrued interest | ≈ 0.0116 MUSD at read time; 1.00% APR (`getTroveInterestRate` = 100 bps) | `getEntireDebtAndColl`, `getTroveDebt` = 2,001.8116 |
| Interest growth | ≈ 0.0548 MUSD per day (2,001.8 × 1% / 365) | derived |
| Collateral ratio | ~163.2% at the testnet BTC price of ~$81,677 (minimum 110%; recovery-mode threshold 150%) | `getCurrentICR` |
| Liquidation price | ≈ $55,050 BTC (debt × 1.10 / 0.04) | derived |
| Wallet MUSD | 1,797.5 | `balanceOf` |
| Other Reach-held value | 2.5 wSMUSD in the secondary wallet `0x3a71…D701` (redeemable for ≈ 2.5 MUSD) | wrapper `balanceOf` |

## What closing requires (from the verified source)

`BorrowerOperations._closeTrove`:

1. Accrues interest (`updateSystemAndTroveInterest`).
2. Requires the trove to be active and **not in recovery mode**.
3. Requires the caller's MUSD balance to be at least **`debt − MUSD_GAS_COMPENSATION`** (debt − 200).
4. Requires the new total collateral ratio to stay at or above 150%.
5. Burns `debt − 200` from the caller, burns the 200 gas reserve from the gas pool, and returns **all collateral** to the caller.

The required balance is about **1,801.81 MUSD plus interest up to the closing transaction**: roughly 1,801.9 MUSD if closed within a day.

| | MUSD |
|---|---|
| Required (now) | ≈ 1,801.81 + ~0.055/day |
| Wallet | 1,797.50 |
| **Shortfall** | **≈ 4.31** |
| After recovering the secondary's 2.5 wSMUSD | **≈ 1.81 short** |

A partial repayment via `repayMUSD` cannot close the gap. Net debt must stay at or above `minNetDebt` = 1,800 MUSD, so only about 1.8 MUSD could be repaid, and the collateral stays locked.

## Repayment plan (needs approval for each transaction)

| # | Chain | From | Action | Notes |
|---|---|---|---|---|
| 1 | Mezo testnet | primary | Send ~0.0002 BTC to the secondary for gas | Native transfer |
| 2 | Mezo testnet | secondary | `ReachSavingsWrapper(0x21C7…3484).redeem(2.5e18, primary, secondary)` | ~2.5 MUSD to primary at the current NAV of 1.0 |
| 3 | — | you | **Obtain ≥ 2.0 MUSD on Mezo testnet** for the primary (for example from another testnet wallet you control) | External; I can't source it |
| 4 | Mezo testnet | primary | Preflight `eth_call` of `closeTrove()`; abort if it reverts (recovery mode, insufficient balance) | Read-only |
| 5 | Mezo testnet | primary | `BorrowerOperations.closeTrove()` | Burns about 1,801.9 MUSD; returns 0.04 BTC |

**Alternative: leave the loan open.** These are testnet funds. The position is at ~163% with no maintenance needed unless testnet BTC falls about 33%, in which case liquidation would take the 0.04 testnet BTC. Interest accrues at about 20 MUSD a year.

**Recommendation.** Leave it open until about 2 MUSD is available. Then run steps 1–5 in one sitting, so interest and price can't move between the preflight check and the close.
