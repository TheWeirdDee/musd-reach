# Threat model and security assumptions

**Status: not independently audited.** The results below come from automated testing and self-review only.

## Trust boundaries

| Component | Trusted for | If compromised |
|---|---|---|
| Wormhole guardians (testnet: 1 key) | Authenticity of every message | Unbacked rwSMUSD mint; release of locked shares |
| Mezo `MUSDSavingsRate` and its owner | Principal custody; strategy | Principal loss, socialised pro rata to wSMUSD |
| Chain finality (consistency 202) | Messages not reorged after signing | Double-spend across chains if a reorg passes finality |
| Reach deployer | One-time `bindSourceGateway` only | Nothing after the bind; a wrong bind is detected by the verifier |
| Guardian role (wrapper, source) | Pausing new deposits and locks | Griefing new entries; cannot block exits or move funds |
| Relayers | Nothing | Can only deliver authentic messages, once |
| Reach API and indexer | Nothing financial | Wrong history display; the UI reads balances and backing from chain |

## Attack matrix

Each row is covered by an automated test, unless the Coverage column says otherwise.

| # | Attack | Mitigation | Coverage |
|---|---|---|---|
| 1 | Forged guardian signature | Core `parseAndVerifyVM` | `test_forgedSignature_rejected`, fork `test_fork_forgedVaa_rejectedByRealCore` |
| 2 | Altered payload | Signature over keccak(keccak(body)) | `test_alteredPayload_rejected`, lifecycle step 04 |
| 3 | Fake emitter on Mezo | Emitter must equal immutable peer | `test_fakeEmitter_sameChain_rejected` |
| 4 | Wrong emitter chain | `peerWormholeChainId` check | `test_wrongEmitterChain_rejected`, `test_issueVaaCannotBeUsedAsRedeem` |
| 5 | Message for another destination or deployment | Every domain field bound and checked | `test_messageForAnotherDestination_rejected`, `test_wrongLocalChain_rejected` |
| 6 | Replay (same VAA) | `transferConsumed` and `vaaConsumed` | `test_issueReplay…`, `test_redeemReplay…`, invariant 4 |
| 7 | Re-observation (new digest, same message) | Transfer id consumed | `test_resignedSameMessage_newDigest_stillRejectedByTransferId` |
| 8 | Stale guardian set | Core rejects | `test_staleGuardianSet_rejected` |
| 9 | Direction confusion (NAV or ISSUE as mint or release) | Direction check per entry point | `test_navVaaCannotMint`, `test_issueVaaCannotBeUsedAsRedeem` |
| 10 | Unauthorized mint or burn of the receipt | Immutable gateway-only minter | `test_receiptMint_onlyGateway` |
| 11 | Release without burn, or refund on timeout | No such code path | `test_noRefundPathExists_lockedUntilAuthenticatedBurn` |
| 12 | Delivery out of order or delayed | Per-transfer ids; no expiry | `test_delayedDelivery_outOfOrder_stillExactlyOnce` |
| 13 | Yield theft by deposit timing | Harvest before price | `test_depositAfterUnclaimedYield_cannotCaptureIt`, fuzz |
| 14 | First-depositor inflation | Virtual offset; tracked accounting | `test_inflationAttack_isUnprofitable` |
| 15 | Direct donation | Tracked accounting | `test_directDonations_doNotMoveSharePrice`, invariant handler |
| 16 | Prior native yield captured by wrapper | Native transfer checkpoint; pricing on principal | `test_depositSavings_priorYieldStaysWithUser` |
| 17 | Native vault outage | In-kind exit. v2: the MUSD redemption is parked as a pending settlement (v1 fell back to shares) | `test_impairedVault_…`, `test_musdMode_vaultOutage_becomesPending_notShares` |
| 18 | Redemption slippage | `minAssets` bound. v2: pending, and the recipient decides | `test_musdMode_belowMinAssets_becomesPending_recipientDecides` |
| 26 | Relayer gas manipulation of the payout asset | v2 out-of-gas guard plus pending settlements | `GasGriefingHeavyStrategyTest`, `testFuzz_relayerGas_neverSwitchesAsset` |
| 27 | Gas-starved PCV distribution (dilution) | v2 out-of-gas guard | `test_pcvDistribution_cannotBeSkipped_viaDepositSavings` |
| 28 | Relayer disappears, or a pending settlement waits indefinitely | VAAs stay deliverable by anyone; `retrySettlement` is permissionless and never mutates the record until it succeeds; the recipient can always take the shares and exit in kind | `test_indefiniteDelay_manyFailedRetries_thenAnyoneSettles` (10 years, 50 failed retries, then a stranger settles), `test_recipientCanExitInKindDuringIndefiniteOutage`, `testFuzz_retriesNeverMutatePendingUntilSuccess`; public steps 12a–12d |
| 29 | Rate-limit evasion through spoofed `X-Forwarded-For` | Only listed proxies are trusted | `apps/api/test/http.test.ts` (F-18) |
| 30 | Under-gassed deliveries from the relayer or the UI | Shared gas policy with a Mezo floor; reverted deliveries consume nothing | `gas.test.ts`, fork E2E (F-20) |
| 31 | Script injection into the app (XSS) steering wallet requests | Per-request nonce CSP with `strict-dynamic`, no `unsafe-inline`/`unsafe-eval`; `connect-src` limited to configured endpoints; `frame-ancestors 'none'` | `e2e/csp.mjs` (F-21) |
| 32 | Forged client-IP headers behind a platform edge with no published proxy range | `CLIENT_IP_HEADER` only for a header the edge overwrites; IP-format check; refused together with `TRUST_PROXY`; verified on the real host | `apps/api/test/http.test.ts`, `scripts/check-rate-limit.mjs` (F-26); hosted run pending |
| 33 | Test-only switches (mock wallet, deployment override) in a hosted build | Build refuses them; production bundles ignore them | Verified build refusal (F-22) |
| 19 | Guardian-role misuse | Can only pause entry | `test_guardianPause_blocksNewLocks_butRedemptionsStillRelease` |
| 20 | Peer rebinding | One-time bind, binder only | `test_bindSourceGateway_isOneTimeAndBinderOnly` |
| 21 | Reentrancy | `nonReentrant` on all entry points; trusted callees only | Slither triage below |
| 22 | Native vault implementation swap | Deploy script and verifier pin the implementation | `deployWrapper` require; `reach-verify registry` |
| 23 | Stale NAV used by a lending oracle | `ReachNavOracle` reverts when stale | `test_oracle_revertsWhenStaleOrMissing`, Morpho fork |
| 24 | Deep reorg past finality | Out of scope | **Not testable**; disclosed |
| 25 | Guardian-set compromise | Out of scope for Reach | **Disclosed**; mainnet requires 13/19 |

## Known limitations

- `previewDeposit` can overstate shares when the PCV holds undistributed fees, because the harvest distributes them first. PCV is zero on testnet, so previews are exact there. This is a documented ERC-4626 deviation.
- Read-only reentrancy: during `vault.withdraw`, the wrapper's `totalAssets()` view is mid-update. Only the vault and its owner-set strategy run code at that point.
- The wrapper cannot detect native impairment before a withdrawal fails, because the vault reports principal 1:1.
- `ReachNavOracle` values MUSD at par, uses a static haircut and reverts when stale. It is a research harness, not a production oracle.
- **Gas griefing of MUSD-mode redemptions (F-01).** In the archived v1 deployment, a relayer can force a MUSD redemption to pay out wSMUSD by starving the inner settlement of gas, when native withdrawals are expensive. v2, deployed on 21 October 2026, reverts gas-starved deliveries and parks genuine failures as pending settlements that the recipient controls. See `docs/SECURITY_FINDINGS.md`.
- **PCV distribution skip (F-02).** Fixed in v2 with an out-of-gas guard. It is inert on testnet, where the PCV is zero.
- Testnet guardian security is a single key.

## Slither triage

`docs/security/slither-summary.txt`: 33 results across 11 detectors (rerun 21 Oct 2026). Slither rates the two `reentrancy-balance` results High; they are triaged below as accepted. No untriaged result remains.

| Detector | Assessment |
|---|---|
| reentrancy-balance / reentrancy-no-eth / reentrancy-benign / reentrancy-events | All flagged functions are `nonReentrant`; callees are the native vault (trusted, nonReentrant) or Wormhole Core. State written after the call is measured from that call's balance delta, by design. Accepted. |
| incorrect-equality | `== 0` guards on amounts and shares; intended. |
| unused-return | `claimYield()` return is deliberately replaced by a measured balance delta. |
| missing-zero-check | `proposeGuardian(0)` is harmless, since nobody can accept as the zero address. Receipt `gateway_` is always `address(this)` from the deploying gateway. |
| timestamp | Oracle staleness uses `block.timestamp` intentionally. |
| dead-code, cyclomatic-complexity | Informational. |

## Not done

No independent audit, no formal verification, no mainnet deployment, no bug bounty.
