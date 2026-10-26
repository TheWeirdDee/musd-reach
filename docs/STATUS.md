# Requirement status

Last updated 26 October 2026. Vocabulary: **PASS** means verified with the evidence cited. **FAIL** means attempted and not met. **BLOCKED** means it needs an owner action or an external party. **NOT TESTED** means not yet attempted. A local or fork test is never reported as a public-testnet PASS.

| ID | Requirement | Status | Evidence / blocker |
|---|---|---|---|
| R-001 | Verify native vault ABI/proxy | **PASS** | Live EIP-1967 read and Blockscout-verified source (`docs/PROTOCOL_VERIFICATION.md`); semantics reproduced on a live-vault fork (`test_fork_nativeSemanticsOnLiveVault`); `pnpm verify registry` |
| R-002 | Wrapper accounting | **PASS (local + fork)** | 24 wrapper tests including fuzz; 7 invariants over 8 192 calls; `docs/ECONOMIC_MODEL.md` |
| R-003 | Real testnet wrap | **PASS (v2)** | 6 MUSD → native vault → 6 wSMUSD, lock tx `0x1fdf…99d7` (Mezo block 16279430); `evidence/real-chain/testnet-2026-10-21T11-23-33-084Z.json` step 02. v1 historical: `0x6804…4c45`, `testnet-2026-10-20T15-05-14-568Z.json` |
| R-004 | Source custody | **PASS (v2)** | 6 wSMUSD locked, released only after authenticated burns; steps 02, 11, 12d. Custody ≥ locked + pending checked by the verifier |
| R-005 | Reach-specific authenticated issue | **PASS (v2)** | Guardian-signed ISSUE VAA from the v2 source gateway; mint tx `0x77f1…1455` (Base block 48406788); steps 03, 05 |
| R-006 | Remote receipt ERC-20 | **PASS (v2)** | Transfer to second holder `0x3a71…D701`, tx `0x52c1…7760`; burns in step 08 (e.g. `0x480b…8b97`, Base block 48406807) |
| R-007 | Authenticated return | **PASS (v2)** | REDEEM VAAs after Base finality; exact wSMUSD to the second holder and MUSD to the primary, recorded tx `0x3fad…6ae0` (Mezo block 16279632); step 11 |
| R-008 | Replay/forgery rejection | **PASS (public, v2)** | Altered ISSUE, replayed ISSUE, wrong-chain REDEEM, replayed REDEEM rejected by the live v2 contracts (read-only simulations); steps 04, 06, 10, 12. Non-recipient settlement changes refused: 12b, 12c |
| R-009 | Independent reconciliation | **PASS (public, v2)** | `reach-verify all` 62/62 on the v2 evidence, rerun 21 Oct (`evidence/real-chain/verify-testnet-2026-10-21T11-23-33-084Z.txt`); live backing BALANCED (issued 6 = released 6, minted 6 = burned 6, pending 0, discrepancy 0) |
| R-010 | Honest UI | **PASS (hosted read-only)** | 47 routes at desktop/tablet/mobile widths; 113 acceptance checks; wallet actions held; current results below |
| R-011 | Partial redemptions | **PASS (local + fork)** | `test_partialRedemptions_conserveValue`; lifecycle step 08 |
| R-012 | Failure recovery | **PASS (public, v2)** for pending settlement; local + fork for the rest | Public steps 12a–12d; liveness tests for a 10-year delay, 50 failed retries and an absent relayer; vault-outage fallback, pause semantics; reorg handling in the indexer (not reorg-tested on a live chain) |
| R-013 | External developer SDK | **PASS (implemented, tested)** | `packages/sdk` with 13 tests, including TS↔Solidity encoding parity; not yet used by a third party |
| R-014 | Real receiving application | **NOT TESTED / BLOCKED** | No independent application uses rwSMUSD |
| R-015 | Morpho compatibility | **PASS (labelled local Base-mainnet fork only)** | `MorphoCompatibilityFork.t.sol`: 3 tests |
| R-016 | Borrowing readiness | **BLOCKED** | No market, liquidity, curator, oracle review or liquidator; borrowing is not offered |
| R-017 | Base canonical MUSD entry | **NOT TESTED** | Documented as a separate user action via the canonical NTT bridge |
| R-018 | Public judge proof | **PASS (hosted)** | v2 run and v1 history are available at https://musd-reach.vercel.app/proof |
| R-019 | Additional remote chain | NOT TESTED | Out of scope |
| R-020 | Strategy reinvestment | NOT TESTED | Out of scope (claim-and-hold) |

## Current release checks

The detailed hackathon schedule has been replaced with "Built for the Mezo hackathon" in the README, protocol notes, planning documents and footer. The README now leads with the problem and solution. The landing CTA identifies the read-only app; the wallet notice is contextual to app routes. The FAQ uses a narrower sticky introduction on desktop and stacks without sticky positioning on mobile.

- Local regressions: contracts 75/75 (no fork tests), SDK 13/13, API 23/23; all five typechecks, lint and production build pass.
- Browser regressions: acceptance 113/113, wallet fixtures 34/34, live-read intents 35/35, rejection 15/15, settlement/history 7/7, keyboard 8/8 and CSP 29/29.
- Before this follow-up, hosted web and API both reported `e67559f`. API readiness returned 200 after cold start, backing was BALANCED, and cursor pagination returned all four recorded transfers without duplicates or missing origin timestamps. See `evidence/product-review/security/public-observations.json`.
- Migration 002's public effects are observable: transfer queries use the origin-time schema and return populated timestamps; indexing catches up. The private `schema_migrations` table was not inspected directly.
- The six review fixes and migration 002 are preserved. No contract, registry, loan or historical public transaction evidence was changed. No new blockchain transactions were sent, including on forks.
- Provider issue [305589](https://github.com/MetaMask/eth-phishing-detect/issues/305589) is OPEN with no provider decision. Read-only presentation is available; normal wallet interaction remains blocked. Historical MetaMask connection tests are not current clearance. Three dependency advisories remain (one high, two moderate); see F-34.

The product follow-up was pushed directly to `main` as `884f84a2dd29be1649554ae4e1eabced10ea403f`. Both production web and API report that exact revision. API readiness is 200 after indexing catches up. Later report/evidence commits do not change app or API code.

Hosted verification of that release:

| Check | Result | Evidence |
|---|---|---|
| Every route, desktop/tablet/mobile | 141 captures across 47 routes; all 200, no page errors or horizontal overflow; correct headings/descriptions/canonicals | `evidence/product-review/hosted/audit.json` |
| Product, metadata and wallet-hold acceptance | 113/113 | `evidence/product-review/hosted-acceptance.txt` |
| Keyboard, including matrix scrolling | 8/8 | `evidence/product-review/hosted-keyboard.txt` |
| CSP, hydration and injection refusal | 29/29 | `evidence/product-review/hosted-csp.txt` |
| Accessibility | No axe violations on primary desktop/mobile routes | `evidence/product-review/hosted-accessibility.txt` |
| Tracker read-state regressions | 4/4 on the hosted bundle with explicit RPC fixtures | `evidence/product-review/hosted-settlement.txt` |
| Actual hosted history API | Four transfers, valid timestamps, no cursor duplicates; indexing ready and backing BALANCED | `evidence/product-review/security/public-observations.json` |
| Independent read-only chain verifier | 62/62, rerun after deployment | `evidence/product-review/live-verifier-2026-10-26.json` |

Connected history fixtures are intentionally not run against production because connecting is blocked; they pass in the separate local keyless suite. No live-chain reorg or failed settlement was manufactured. The private migration ledger was not directly inspected. Updated source and documentation are existing files; new files in this pass are required test transcripts and screenshots, not another dated report. See `evidence/product-review/change-inventory.json` for the per-file source commits.

This is an engineering self-review and a separate read-only chain verifier, not an independent professional or human usability audit. The read-only submission and public proof are available; a normal-wallet transaction demo remains blocked pending classification review. Earlier platform rows below are historical observations.

## Platform - historical checks from 21-23 October

| Item | Status |
|---|---|
| Contracts: 75 local tests + 7 fork tests (v2 code) | PASS (rerun in the release pass) |
| v2 contracts on public testnet | PASS: Mezo wrapper `0xf8cF…4306`, source `0xA5c7…96d3`; Base Sepolia destination `0x5043…5a23`, receipt `0x0277…4e89` (`deployments/testnet.json`). Runtime bytecode matches the build with immutables masked |
| v1 contracts | Live, archived (`deployments/testnet-v1.json`); affected by F-01; source not in git history (D-01) |
| v2 public lifecycle (18 steps, including pending settlement) | PASS (public) |
| Browser E2E of signing flows (mock connector, forks) | PASS (fork), 21/21, rerun after the CSP and production-guard changes |
| Transaction intent (keyless wallet, real balances): targets, chain ids, exact approvals, gas floor | PASS, 42/42 |
| Content-Security-Policy (production build) | PASS, 25/25: nonce scripts, zero violations, injection refused |
| Responsive: 15 routes × 4 widths × both motion settings | PASS, 120/120 (after the F-29 fix) |
| Rejected signature / rejected switch / wallet on an unsupported chain | PASS, 15/15 (scripted EIP-1193 provider rejecting with 4001) |
| Real MetaMask extension (13.53.0) | PARTIAL: connect, connect rejection, session persistence, network detection, network switch (approved and rejected), account switching and disconnect PASS under the production CSP. Signing and rejecting a transaction NOT TESTED (the throwaway wallet holds no MUSD; funding it is outside the authorized transactions) |
| Rabby, WalletConnect | NOT TESTED |
| Accessibility | PASS (axe-core 4.10: no violations on all routes; keyboard focus check). Screen reader NOT TESTED |
| Slither | PASS: same 33 results on rerun, all triaged; the 2 Slither-High `reentrancy-balance` results are accepted (all entry points `nonReentrant`, trusted callee) |
| SDK tests / typecheck | PASS |
| API tests (14: HTTP policy, proxy and config guards, readiness, input bounds) / typecheck | PASS |
| API Docker image | PASS (WSL Docker 29.1): 117 MB, non-root, healthy on an injected `PORT`; `/ready` 503 → 200 after indexing; cursors persist across a restart; reconciliation BALANCED against the live chains |
| Web typecheck, ESLint, production build (14 routes) | PASS |
| Source repository | PUBLISHED: https://github.com/TheWeirdDee/musd-reach (pushed without force) |
| Public hosting: API, web | LIVE (testnet), deployed by the owner on 23 Oct 2026: web https://musd-reach.vercel.app (Vercel), API https://musd-reach-api.onrender.com (Render Free, sleeps when idle). Commit `1fa705a`. Checked on the hosted URLs: CSP 25/25, transaction intent 42/42, rejection 15/15, wallet UI 10/10, keyboard 6/6, responsive 120/120, axe no violations; API ready, CORS limited to the site, backing BALANCED, rate limit held per client (115 of 250 with forged headers) behind Cloudflare's `CF-Connecting-IP`; verifier 62/62 |
| Independent audit (professional or external users) | NOT DONE |

## Canonical run notes

The v1 run needed three attempts. Attempt 1 was rejected before inclusion: Mezo enforces the EIP-7623 calldata floor, and the estimate was below it. Attempt 2's deposit ran out of gas on a stale RPC estimate and reverted, which spent gas but changed nothing. Attempt 3 mined every lifecycle transaction but aborted twice on RPC read lag and an RPC crash before writing evidence. The final evidence pass adopted those 8 mined transactions after verifying sender, target and function selector, and re-derived every effect from chain state at their blocks. The evidence file lists them under `reusedTransactions`.

The v2 run needed no reused transactions.

## Security findings

See `docs/SECURITY_FINDINGS.md`. F-01 still affects archived v1 and is fixed in deployed v2. F-33 is an open release blocker: a MetaMask malicious-site warning was reported during connection; [provider review #305589](https://github.com/MetaMask/eth-phishing-detect/issues/305589) is open, not cleared. F-34 tracks partially remediated dependency advisories. The hosted build at `884f84a` holds wallet connections and writes. The product-copy/FAQ follow-up is live and verified; details are in Current release checks. F-04, F-05 and D-01 remain disclosed.
