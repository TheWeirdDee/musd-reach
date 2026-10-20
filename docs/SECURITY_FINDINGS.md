# Findings register

Self-audit only. This is **not** an independent professional audit. Severity uses impact × likelihood for a testnet product that targets mainnet later.

Status vocabulary:
- **Fixed (local)** means the code is changed and regression-tested locally and on forks, but **not deployed**.
- **Open** means the issue is not fixed.
- **Disclosed** means it is accepted and documented.

| ID | Severity | Component | Finding | Status |
|---|---|---|---|---|
| F-01 | Medium | `ReachSourceGateway.receiveRedeem` | Relayer gas manipulation can switch a MUSD-mode redemption to a wSMUSD payout | **Fixed (local, v2)**. Deployed v1 is still affected |
| F-02 | Medium (mainnet) / inert on testnet | `ReachSavingsWrapper._harvest` | Gas-starving the PCV distribution lets a `depositSavings` caller price in before owed fees are distributed (dilution) | **Fixed (local, v2)** |
| F-03 | Low | `ReachSavingsWrapper.redeemInKind` | A gas-starved harvest is silently skipped; the exiting holder forfeits unharvested yield | **Fixed (local, v2)** |
| F-04 | Low | v2 pending settlements | A contract recipient that cannot call `settleWithMinAssets` / `claimSharesInstead` relies on permissionless `retrySettlement`; if the vault never recovers, its shares stay parked | **Disclosed** |
| F-05 | Info | Wrapper ERC-4626 | `previewDeposit` can overstate shares when the PCV holds undistributed fees | **Disclosed** (PCV is zero on testnet) |
| F-06 | Medium | Web, `lib/wagmi.ts` | Chain definitions carried hard-coded public RPCs instead of the configured ones; connectors that forward requests (and `wallet_addEthereumChain`) used the wrong endpoint | **Fixed** |
| F-07 | Medium | Web, transfer tracker | Two queries shared the react-query key `["pending-settlement", id]` with different result shapes, causing a crash or a false "released" label | **Fixed** |
| F-08 | Medium | Web, transfer tracker | A consumed REDEEM was shown as "released" even if its MUSD settlement was pending | **Fixed** |
| F-09 | Low | Tooling (runner, SDK, verifier) | Mezo RPC returned near-intrinsic gas estimates against stale state; receipt lookups were flaky; Base public RPC caps `getLogs` at 200 blocks | **Fixed** |
| F-10 | Low | Verifier | Crashed when the Base deployment block was not yet finalized | **Fixed** (`AWAITING_FINALITY`) |
| F-11 | Info | Deployment | The live public deployment is v1 (`fallback-v1`) and remains affected by F-01 until a v2 deployment replaces it in the app | **Disclosed** in the UI (`/risks`, redeem page, FAQ, proof page) |
| F-12 | Low | Web/SDK reconciliation | `sepolia.base.org` rejects `eth_getLogs` ranges above ~200 blocks with HTTP 413; the browser fell back silently but logged errors and wasted requests | **Fixed**: publicnode preferred; 413 handled by adaptive range splitting. Reconciliation still scans from the deploy block, which is O(history) and acceptable at testnet scale |

## F-01: Relayer gas manipulation of the payout asset

**Reproduction.** `test/GasGriefing.t.sol::GasGriefingHeavyStrategyTest`.
- **Setup:** the native vault uses a strategy whose `deallocate` costs about 3M gas. The vault owner can install such a strategy at any time.
- **Attack:** a relayer delivers a MUSD-mode REDEEM with exactly 3,880,000 gas.
- **Result on v1:** the inner `redeemForRecipient` runs out of gas, the `catch` branch has enough of the remaining 1/64 to transfer shares, and the recipient receives wSMUSD instead of MUSD.

With the current idle strategy, the sweep from 120k to 1.2M gas did not reproduce it, because the 1/64 left over cannot pay for the fallback.

**Root cause.** The catch-all fallback treated every inner failure, including out-of-gas caused by the relayer, as a reason to change the payout asset.

**Fix (v2).**
- After a failed settlement attempt, `gasleft() <= gasBefore / 63` means the callee ran out of gas. The whole delivery reverts with `InsufficientGasForSettlement`, so nothing is consumed and the message remains deliverable.
- A genuine failure (vault outage, NAV below the minimum) records a `PendingSettlement`. The shares stay in custody under `totalPendingSettlement`.
- `retrySettlement` is permissionless and keeps the burner's minimum.
- Only the recipient may call `settleWithMinAssets` (to lower the minimum) or `claimSharesInstead`.
- Nobody else can change the payout asset.

**Regression tests.**
- `GasGriefingHeavyStrategyTest` (fails on v1, passes on v2).
- `GasGriefingTest`.
- `testFuzz_relayerGas_neverSwitchesAsset`, 512 runs over 100k–8M gas.
- `testFuzz_starvedRetry_leavesPendingIntact`.
- `test_musdMode_vaultOutage_becomesPending_notShares`.
- `test_musdMode_belowMinAssets_becomesPending_recipientDecides`.
- `test_pendingSettlement_recipientMayChooseShares`.
- `test_pendingSettlement_cannotBeReplayedIntoSecondPayout`.
- `test_multiplePendingSettlements_independent`.
- The stateful invariant `invariant_pendingSettlementsFullyBacked`, with outages, retries and share claims in the handler. A probe confirmed the campaign reaches pending states.

**Fork evidence.** `evidence/fork-rehearsal/fork-2026-10-20T19-19-24-698Z.json`, steps 12a–12d, plus the browser E2E "pending" phase.

## F-02: PCV distribution skip (dilution)

**Reproduction.** `test_pcvDistribution_cannotBeSkipped_viaDepositSavings`. A PCV whose distribution consumes all forwarded gas, called with a 29M-gas `depositSavings`: the unguarded wrapper completes the deposit with the distribution skipped. The test **fails on v1 code and passes on v2**, which was verified by temporarily removing the guard.

The MUSD `deposit` path is not exploitable, because the native vault's own `deposit` retries the distribution and starves too.

**Fix.** An out-of-gas guard after the best-effort `distributeMUSD()`.

## F-03: In-kind harvest skip

**Fix.** The same out-of-gas guard on `try this.harvestForInKind()`. A genuine harvest failure is still tolerated, so the in-kind exit stays available during outages.

## Retest

- Contracts: 72 local tests and 7 fork tests pass.
- Slither: 33 results, no high severity (`docs/security/slither-summary.txt`).
- v2 fork lifecycle: 18/18 steps.
- Browser E2E on forks: 5 phases pass (wrap, minted, redeem, released, pending).
