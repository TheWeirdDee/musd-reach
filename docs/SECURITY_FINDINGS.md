# Findings register

Self-audit only. This is **not** an independent professional audit. Severity uses impact × likelihood for a testnet product that targets mainnet later.

Status vocabulary:
- **Fixed (deployed v2)** means the fix is in the v2 contracts deployed on 21 October 2026 and verified on the public testnets.
- **Fixed** (off-chain components) means the code is changed, regression-tested and committed locally. The web app and API are **not publicly hosted**.
- **Open** means the issue is not fixed.
- **Disclosed** means it is accepted and documented.

| ID | Severity | Component | Finding | Status |
|---|---|---|---|---|
| F-01 | Medium | `ReachSourceGateway.receiveRedeem` | Relayer gas manipulation can switch a MUSD-mode redemption to a wSMUSD payout | **Fixed (deployed v2)**. The archived v1 deployment is still affected |
| F-02 | Medium (mainnet) / inert on testnet | `ReachSavingsWrapper._harvest` | Gas-starving the PCV distribution lets a `depositSavings` caller price in before owed fees are distributed (dilution) | **Fixed (deployed v2)** |
| F-03 | Low | `ReachSavingsWrapper.redeemInKind` | A gas-starved harvest is silently skipped; the exiting holder forfeits unharvested yield | **Fixed (deployed v2)** |
| F-04 | Low | v2 pending settlements | A contract recipient that cannot call `settleWithMinAssets` / `claimSharesInstead` relies on permissionless `retrySettlement`; if the vault never recovers, its shares stay parked | **Disclosed** |
| F-05 | Info | Wrapper ERC-4626 | `previewDeposit` can overstate shares when the PCV holds undistributed fees | **Disclosed** (PCV is zero on testnet) |
| F-06 | Medium | Web, `lib/wagmi.ts` | Chain definitions carried hard-coded public RPCs instead of the configured ones; connectors that forward requests (and `wallet_addEthereumChain`) used the wrong endpoint | **Fixed** |
| F-07 | Medium | Web, transfer tracker | Two queries shared the react-query key `["pending-settlement", id]` with different result shapes, causing a crash or a false "released" label | **Fixed** |
| F-08 | Medium | Web, transfer tracker | A consumed REDEEM was shown as "released" even if its MUSD settlement was pending | **Fixed** |
| F-09 | Low | Tooling (runner, SDK, verifier) | Mezo RPC returned near-intrinsic gas estimates against stale state; receipt lookups were flaky; Base public RPC caps `getLogs` at 200 blocks | **Fixed** |
| F-10 | Low | Verifier | Crashed when the Base deployment block was not yet finalized | **Fixed** (`AWAITING_FINALITY`) |
| F-11 | Info | Deployment | v1 (`fallback-v1`) stays live and redeemable, and remains affected by F-01. The app now points at v2 | **Disclosed**: v1 is labelled historical on the proof page, with its known issue; `deployments/testnet-v1.json` |
| F-12 | Low | Web/SDK reconciliation | `sepolia.base.org` rejects `eth_getLogs` ranges above ~200 blocks with HTTP 413; the browser fell back silently but logged errors and wasted requests | **Fixed**: publicnode preferred; 413 handled by adaptive range splitting. Reconciliation still scans from the deploy block, which is O(history) and acceptable at testnet scale |
| F-13 | Medium | SDK/verifier/API reconciliation | Reconciling at Base `finalized` reported a false MISMATCH of −6 rwSMUSD during the v2 run: the RPC `finalized` head lagged blocks whose burns guardians had already attested and Mezo had released | **Fixed**: Base `latest` read first, then Mezo; regression test `reconcile.test.ts` |
| F-14 | Low | Verifier | About two of three Mezo RPC backends returned `null` for older receipts, failing evidence checks at random | **Fixed**: receipt retries, then a Blockscout fallback labelled as such in the output |
| F-15 | Low | API indexer | Inside the Docker smoke test the Base indexer failed every window with HTTP 413 from `sepolia.base.org` | **Fixed**: publicnode default, adaptive window splitting shared with the SDK |
| F-16 | Low | Web UX and accessibility | axe: 386 contrast failures, scrollable regions not focusable, an empty table header; inputs had no visible keyboard focus; an empty recipient was shown as an error; MetaMask was listed twice ("Browser wallet" and "MetaMask") | **Fixed**: axe reports no violations; `e2e/axe.mjs`, `e2e/keyboard.mjs`, `e2e/wallet-ui.mjs` |
| F-17 | Medium | Web, wallet network | With a wallet on an unconfigured chain (a fresh MetaMask on Ethereum mainnet), the badge said "Mezo testnet" and actions skipped the switch request, failing with a raw chain-mismatch error. Found with the real MetaMask extension | **Fixed**: the connector's real chain drives the badge and the switch; `e2e/rejection.mjs` "unsupported-chain" |
| F-18 | Medium | API | `trustProxy: true` took the client-written leftmost `X-Forwarded-For` entry as the client IP, so rotating it bypassed the rate limit. 5xx responses also echoed internal error text | **Fixed**: only listed proxies are trusted (`TRUST_PROXY`); generic 502 body; `apps/api/test/http.test.ts` (fails on the old setting) |
| F-19 | Low | API image | The container started through `pnpm start`, whose dependency check tried to reinstall into the read-only `/repo` and exited (exit 243), leaving the container unhealthy | **Fixed**: the image starts `node` directly; Docker smoke test healthy |
| F-20 | Low | Relayer and web transactions | Both sent Mezo transactions with the RPC's gas estimate, which omits the EIP-7623 calldata floor. An under-gassed `receiveRedeem` reverts by design, so the relayer would retry and pay every 20 seconds | **Fixed**: shared `gasLimitFor` policy (the one the v2 public run used); relayer checks receipts; `gas.test.ts`, fork E2E shows a 1.5M limit on a UI-signed Mezo transaction |
| F-21 | Medium (before hosting) | Web | No Content-Security-Policy: any HTML-injection bug would have run attacker script next to wallet requests | **Fixed**: per-request nonce CSP from `src/proxy.ts`. `script-src` has nonce and `strict-dynamic` only, with no `unsafe-inline` or `unsafe-eval`; `style-src` is `'self'` and the nonce; `connect-src` is built from the configured RPCs and API. `e2e/csp.mjs` 25/25: zero violations on every route, and an injected inline script, inline handler and `eval` are all refused |
| F-22 | Medium | Web build | Test-only switches were kept out of production only by convention: `NEXT_PUBLIC_E2E_ACCOUNT` (keyless mock wallet), `NEXT_PUBLIC_REACH_DEPLOYMENT` (replaces every contract address) and `NEXT_PUBLIC_NETWORK_MODE=fork` | **Fixed**: `next build` refuses to run with any of them set (verified), and production bundles ignore them (`testHooksEnabled`) |
| F-23 | Low | Web, WalletConnect | WalletConnect metadata advertised `https://musd-reach.app`, a domain this project does not own, to wallets and to origin verification | **Fixed**: the real page origin (or `NEXT_PUBLIC_SITE_URL` on the server) |
| F-24 | Low | Web UX | A wallet on an unsupported network with no balance had every action disabled, so there was no way to switch to Mezo or Base | **Fixed**: the wallet menu offers both networks. Verified with real MetaMask 13.53.0 (add-and-switch approved and rejected); `e2e/tx-intent.mjs` and `e2e/rejection.mjs` |
| F-25 | Low | API hosting | The API listened only on `API_PORT`, but Railway routes to the `PORT` it injects. `/ready` reported ready before any indexing, or on a success from long ago. Empty variables copied from `.env.example` broke the config | **Fixed**: `PORT` honoured; `/ready` is 503 until both indexers succeed within 10 minutes; empty values count as unset. `test/ready.test.ts` (fails on the old route) and `test/http.test.ts`; Railway-like Docker run with a restart |
| F-26 | Low | API rate limiting on Railway | Railway publishes no stable proxy address range, so `TRUST_PROXY` cannot be pinned there, and forum reports conflict on whether the edge strips client `X-Forwarded-For` | **Fixed, hosted check pending**: opt-in `CLIENT_IP_HEADER=x-real-ip`. Railway documents that its edge sets this header. The API accepts only a well-formed IP, falls back to the socket address, and refuses `TRUST_PROXY` together with it. `scripts/check-rate-limit.mjs` must pass against the hosted URL; it was shown to fail on a misconfigured instance |
| F-27 | Info | Docs and tooling accuracy | Several statements were out of date or wrong. Docs and the landing page said Slither had "no high", but it rates two `reentrancy-balance` results High (triaged, accepted). The documented `pnpm verify all <file>` failed from the repository root. The integrations registry still showed the rwSMUSD transfer as pending. Planning documents at the root said "implementation not verified". `foundry.toml` granted write access to a machine-local temp path | **Fixed**: wording corrected, verifier resolves paths from the invoking directory, registry cites the v2 evidence, planning documents moved to `docs/planning` with a status note, path removed |
| F-28 | Info | API input validation | Amounts of 78 digits at or above 2^256 passed validation and failed in the ABI encoder, after an RPC call, surfacing as a misleading 502 "upstream unavailable" | **Fixed**: the schema rejects values above `uint256` as 400 before any chain read; `test/ready.test.ts` (fails on the old schema) |
| D-01 | Info | Provenance | The repository's git history starts after the v1 contracts were changed into v2, so the v1 bytecode cannot be rebuilt from any commit. v1 evidence is verified against chain state, not against source | **Disclosed** |

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

**Public evidence (v2).** `evidence/real-chain/testnet-2026-10-21T11-23-33-084Z.json`:
- Step 12a parks an unreachable-minimum MUSD redemption as pending (tx `0xb89c…c29e`, Mezo block 16279633).
- Step 12b: a permissionless retry keeps the burner's minimum and is refused.
- Step 12c: a non-recipient can neither switch the payout to shares nor lower the minimum.
- Step 12d: the recipient settles once at an acceptable minimum (tx `0x5165…62be9`, block 16279637).

**Liveness (indefinite delay, absent relayer).** `PendingSettlementLivenessTest`:
- `test_indefiniteDelay_manyFailedRetries_thenAnyoneSettles`: 10 years and 50 failed retries leave the pending record unchanged; then an unrelated address settles it at the burner's minimum.
- `test_recipientCanExitInKindDuringIndefiniteOutage`: during a permanent vault outage the recipient takes the shares and exits in kind.
- `testFuzz_retriesNeverMutatePendingUntilSuccess`.

No relayer, operator or backend is needed for recovery. The VAA stays deliverable by anyone, and `retrySettlement` is callable by anyone.

## F-02: PCV distribution skip (dilution)

**Reproduction.** `test_pcvDistribution_cannotBeSkipped_viaDepositSavings`. A PCV whose distribution consumes all forwarded gas, called with a 29M-gas `depositSavings`: the unguarded wrapper completes the deposit with the distribution skipped. The test **fails on v1 code and passes on v2**, which was verified by temporarily removing the guard.

The MUSD `deposit` path is not exploitable, because the native vault's own `deposit` retries the distribution and starves too.

**Fix.** An out-of-gas guard after the best-effort `distributeMUSD()`.

## F-03: In-kind harvest skip

**Fix.** The same out-of-gas guard on `try this.harvestForInKind()`. A genuine harvest failure is still tolerated, so the in-kind exit stays available during outages.

## Retest (21 October 2026)

- Contracts: 75 local tests and 7 fork tests pass.
- Slither rerun: the same 33 results under the same 11 detectors, (`docs/security/slither-summary.txt`). Two are rated High by Slither (`reentrancy-balance` in `_deposit` and `_payOut`); both are triaged as accepted in `docs/THREAT_MODEL.md` because every entry point is `nonReentrant` and the callee is the native vault. No untriaged result remains.
- v2 public run: 18/18 steps. `reach-verify all`: 62/62 (`evidence/real-chain/verify-testnet-2026-10-21T11-23-33-084Z.txt`).
- Browser E2E on forks: 5 phases pass (wrap, minted, redeem, released, pending), rerun after F-20.
- Wallet E2E: `rejection.mjs` 14/14, `wallet-ui.mjs` 10/10. axe: no violations. Keyboard: 6/6.
- Real MetaMask 13.53.0: see `docs/TESTING.md`. Connect, connect-reject and network detection were tested; signing a transaction was not.
- API: 5 HTTP-policy tests. SDK: 10 tests.
