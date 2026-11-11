# Business model

MUSD Reach turns Mezo savings into collateral on Base. It earns when that collateral is put to work, and never charges for getting in or out.

## Who pays, for what

| Revenue line | Status | Mechanism |
|---|---|---|
| **Vault performance fee** | **Live on Base Sepolia** | The Reach USDC Vault (Morpho Vault V2) lends into the rwSMUSD market. Reach, as curator, receives **10% of the interest** the vault earns, minted as vault shares to the Reach treasury. |
| Curated MUSD vault on Base | Mainnet launch | The same vault denominated in **native MUSD on Base** (already bridged by Mezo over Wormhole NTT): Mezo savers borrow MUSD against their own savings. |
| Looping vault | After launch | One-click loop: rwSMUSD → borrow MUSD on Base → bridge to Mezo → deposit into savings → more rwSMUSD. Same 10% performance fee on the vault side. |
| Integration listings | After launch | Base protocols that list rwSMUSD use Reach's NAV oracle and keeper. Free to integrate; listings route borrowers back into Reach-curated liquidity. |

**Free by design:** making savings portable, transferring rwSMUSD and redeeming to Mezo charge no Reach fee (users pay only network gas). A saver who never borrows pays nothing, so the fee is aligned with the value created.

## Why it grows Mezo

- Every rwSMUSD is backed by MUSD deposited in **Mezo's own Savings Vault**. More borrowing demand on Base means more MUSD saved on Mezo.
- A deeper Savings Vault compounds the MUSD fee flow that already goes to savers and veBTC voters.
- Today about **$1.35M of $18.8M MUSD (≈7%) is saved** (DefiLlama, 11 Nov 2026). Removing the "earn or use" trade-off is how that share grows.

## Unit economics (illustrative)

| Portable savings | Utilization | Borrow APR | Annual interest | Reach revenue (10%) |
|---|---|---|---|---|
| $2M | 50% | 6% | $60k | $6k |
| $10M | 60% | 6% | $360k | $36k |
| $50M | 70% | 6% | $2.1M | $210k |

Operating costs are near zero: contracts are immutable with no admin custody, the API runs on a free tier kept warm by a scheduled job, and the NAV keeper costs a few cents of gas per day.

## Go-to-market

1. **Mezo savers first.** In-app path from Mezo's Savings Vault: "keep earning, borrow on Base".
2. **MEZO gauge proposal.** Direct emissions to rwSMUSD lenders to bootstrap liquidity, the same way Mezo bootstraps its own pools.
3. **Base integrations.** List rwSMUSD as collateral beyond the Reach vault with the same oracle.

## Milestones

1. External audit of the wrapper, gateways and NAV oracle.
2. Capped mainnet launch: Mezo mainnet ↔ Base, native MUSD vault, conservative LLTV.
3. MEZO gauge proposal and the looping vault.
