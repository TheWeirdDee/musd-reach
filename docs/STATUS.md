# Requirement status

Last updated 20 October 2026. Vocabulary: **PASS** means verified with the evidence cited. **FAIL** means attempted and not met. **BLOCKED** means it needs an owner action or an external party. **NOT TESTED** means not yet attempted. A local or fork test is never reported as a public-testnet PASS.

| ID | Requirement | Status | Evidence / blocker |
|---|---|---|---|
| R-001 | Verify native vault ABI/proxy | **PASS** | Live EIP-1967 read and Blockscout-verified source (`docs/PROTOCOL_VERIFICATION.md`); semantics reproduced on a live-vault fork (`test_fork_nativeSemanticsOnLiveVault`); `pnpm verify registry` |
| R-002 | Wrapper accounting | **PASS (local + fork)** | 24 wrapper tests including fuzz; 7 invariants over 8 192 calls; `docs/ECONOMIC_MODEL.md` |
| R-003 | Real testnet wrap | **PASS** | 5 MUSD → native vault → 5 wSMUSD, lock tx `0x6804…4c45` (Mezo block 16263726); `evidence/real-chain/testnet-2026-10-20T15-05-14-568Z.json` step 02 |
| R-004 | Source custody | **PASS** | 5 wSMUSD locked, released only after authenticated burns; steps 02, 11 |
| R-005 | Reach-specific authenticated issue | **PASS** | Guardian-signed VAA 50/0 from the Reach source gateway; mint tx `0xa56f…1b75` (Base block 48369152); steps 03, 05 |
| R-006 | Remote receipt ERC-20 | **PASS** | Transfer to second holder `0x6639…0e41`, burns `0x2798…02e1` / `0x99c4…2f43`; steps 07, 08 |
| R-007 | Authenticated return | **PASS** | VAAs 10004/0 and 10004/1 after Base finality; releases `0x9c60…9214` (shares) and `0x462e…1f9e` (MUSD); steps 09, 11 |
| R-008 | Replay/forgery rejection | **PASS (public)** | Altered ISSUE, replayed ISSUE, wrong-chain REDEEM, replayed REDEEM all rejected by the live contracts (read-only simulations); steps 04, 06, 10, 12 |
| R-009 | Independent reconciliation | **PASS (public)** | `reach-verify` 52/52 on the evidence file; live backing BALANCED (issued 5 = released 5, minted 5 = burned 5, discrepancy 0) |
| R-010 | Honest UI | **PASS (local review)** | Not-deployed states, no APY, no fabricated values; responsive sweep 320–1440px, 0 overflow, 0 console errors |
| R-011 | Partial redemptions | **PASS (local + fork)** | `test_partialRedemptions_conserveValue`; lifecycle step 08 |
| R-012 | Failure recovery | **PASS (local + fork, v2)**: pending settlements with retry and recipient choice; gas-starved deliveries revert | Out-of-order and delayed delivery, vault outage fallback, pause semantics; reorg handling in indexer (not reorg-tested on a live chain) |
| R-013 | External developer SDK | **PASS (implemented, tested)** | `packages/sdk` with 6 tests including TS↔Solidity encoding parity; not yet used by a third party |
| R-014 | Real receiving application | **NOT TESTED / BLOCKED** | No independent application uses rwSMUSD |
| R-015 | Morpho compatibility | **PASS (labelled local Base-mainnet fork only)** | `MorphoCompatibilityFork.t.sol`: 3 tests |
| R-016 | Borrowing readiness | **BLOCKED** | No market, liquidity, curator, oracle review or liquidator; borrowing is not offered |
| R-017 | Base canonical MUSD entry | **NOT TESTED** | Documented as a separate user action via the canonical NTT bridge |
| R-018 | Public judge proof | **PASS (data) / BLOCKED (hosting)** | Run published to `/proof`; the site is not yet publicly hosted |
| R-019 | Additional remote chain | NOT TESTED | Out of scope |
| R-020 | Strategy reinvestment | NOT TESTED | Out of scope (claim-and-hold) |

## Platform

| Item | Status |
|---|---|
| Contracts: 72 local tests + 7 fork tests (v2 code) | PASS |
| v2 contracts on public testnet | NOT DEPLOYED: needs authorization (`docs/DEPLOYMENT.md`, v2 plan) |
| v2 fork lifecycle (18 steps, including pending settlement) | PASS (fork) |
| Browser E2E of signing flows (mock connector, forks) | PASS (fork); real wallet extensions NOT TESTED |
| Slither | PASS: no high findings, triaged in `THREAT_MODEL.md` |
| SDK tests / typecheck | PASS |
| API typecheck; indexer derived all 6 rehearsal transfers; reconciliation BALANCED on forks | PASS (fork) |
| Web typecheck, ESLint (React Compiler rules), production build (14 routes) | PASS |
| Accessibility audit (axe / screen reader) | NOT TESTED; keyboard focus, labels and reduced motion are implemented |
| Public deployment: contracts | PASS — Mezo testnet wrapper `0x21C7…3484`, source `0x4Fc8…8cdc`; Base Sepolia destination `0xcdF1…f973`, receipt `0xf66E…0bF8` (`deployments/testnet.json`) |
| Public deployment: API, web | BLOCKED: needs hosting accounts |
| Independent audit | NOT DONE |


## Canonical run notes

The run needed three attempts. Attempt 1 was rejected before inclusion: Mezo enforces the EIP-7623 calldata floor, and the estimate was below it. Attempt 2's deposit ran out of gas on a stale RPC estimate and reverted, which spent gas but changed nothing. Attempt 3 mined every lifecycle transaction but aborted twice on RPC read lag and an RPC crash before writing evidence. The final evidence pass adopted those 8 mined transactions after verifying sender, target and function selector, and re-derived every effect from chain state at their blocks. The evidence file lists them under `reusedTransactions`.

## Security findings

See `docs/SECURITY_FINDINGS.md`. F-01 (Medium: relayer gas manipulation of the payout asset) **affects the deployed v1**. It is fixed in v2, which is not yet deployed.
