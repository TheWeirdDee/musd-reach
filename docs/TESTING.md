# Testing

| Layer | Command | What it covers |
|---|---|---|
| Contracts, local | `cd packages/contracts && forge test` | Unit, fuzz (512 runs) and stateful invariants: wrapper accounting, gateway auth/replay, NAV oracle, gas griefing (F-01..F-03) |
| Contracts, fork | `RUN_FORK=true forge test --match-path "test/fork/ReachLiveFork.t.sol"` | Live Mezo vault and real Wormhole cores (guardian set substituted in fork storage) |
| Morpho, fork | `RUN_FORK_BASE_MAINNET=true forge test --match-contract MorphoCompatibilityForkTest` | Real Morpho Blue on a Base mainnet fork |
| SDK | `pnpm --filter @musd-reach/sdk test` | TS↔Solidity encoding parity, VAA digest parity with Wormholescan, exact amount math |
| Lifecycle, fork | Anvil forks on :8545/:8546; deploy with `REACH_DEPLOYMENTS=cache/fork-deployments.json` (gitignored; Foundry may only write inside the package, `evidence/` and `deployments/`); then, from the repository root, `REACH_DEPLOYMENTS=packages/contracts/cache/fork-deployments.json npx tsx scripts/lifecycle.ts --mode fork` | Full round trip; v2 deployments add steps 12a–12d |
| Browser E2E, fork | see below | Real UI signing flows with the wagmi mock connector |
| Verifier | `pnpm verify all [evidence.json]` | Independent chain-only checks |
| API | `pnpm --filter @musd-reach/api test` | HTTP policy: proxy trust, edge client-IP header, rate-limit spoofing, error mapping, config guards, platform `PORT`, `/ready` semantics, amount bounds (F-18, F-25, F-26, F-28) |
| Wallet rejection | `node apps/web/e2e/rejection.mjs [url]` | Scripted EIP-1193 wallet rejecting with 4001: rejected signature, rejected switch, wallet on an unsupported chain (F-17) |
| Wallet UI | `node apps/web/e2e/wallet-ui.mjs [url]` | Recipient validation; an EIP-6963 wallet listed once (F-16) |
| Accessibility | `node apps/web/e2e/axe.mjs [url]` and `e2e/keyboard.mjs [url]` | axe-core WCAG 2.1 AA on every route at 1280 and 390 px; fails if axe did not load. Keyboard order and visible focus |
| CSP | `node apps/web/e2e/csp.mjs [url]` (production build) | Nonce CSP shape; every script nonce'd; zero violations on 15 routes; injected inline script, inline handler and `eval` refused (F-21) |
| Transaction intent | `node apps/web/e2e/tx-intent.mjs [url]` | Keyless wallet with real balances: approve target, spender, exact amount, chain id, sender, Mezo gas floor, review matches the transaction; account and chain changes, reload persistence, menu network switch (F-24) |
| Responsive | `node apps/web/e2e/responsive.mjs [url]` | 15 routes × 320/390/768/1280 px × both motion settings: no real sideways scroll, heading, no page errors (F-29) |
| Rate-limit probe | `node scripts/check-rate-limit.mjs <api url> [limit]` | Post-deploy: rotating forged `X-Forwarded-For` / `X-Real-IP` must still hit 429 (F-18, F-26) |

## Browser E2E against local forks

1. Start forks with impersonation: `anvil --fork-url https://rpc.test.mezo.org --port 8545 --chain-id 31611 --auto-impersonate`, and the same for Base Sepolia on port 8546.
2. Deploy v2 to the forks with `DeployReach.s.sol`, with `REACH_DEPLOYMENTS=cache/fork-deployments.json` (relative to `packages/contracts`).
3. Fund a test address **on the forks only**, using `anvil_setBalance` and MUSD from an impersonated holder.
4. Start the app bound to the fork deployment. The mock connector exists only when `NEXT_PUBLIC_E2E_ACCOUNT` is set at build time:

   ```
   NEXT_PUBLIC_REACH_DEPLOYMENT="$(cat scratch.json)" NEXT_PUBLIC_MEZO_RPC=http://127.0.0.1:8545 \
   NEXT_PUBLIC_BASE_RPC=http://127.0.0.1:8546 NEXT_PUBLIC_NETWORK_MODE=fork \
   NEXT_PUBLIC_E2E_ACCOUNT=0x…E2E01 next dev -p 3001
   ```

5. Run `node apps/web/e2e/fork-flows.mjs wrap`. Then deliver with `scripts/fork-deliver.ts --dir ISSUE`, and run the `minted`, `redeem`, `released` and `pending` phases. Later phases take the tracker URL through `E2E_TRACKER`.

`fork-deliver.ts` refuses to run unless both RPCs report Anvil.

## Review results (25 October 2026)

See [the submission review](REVIEW_2026-10-25.md) for the fixes, current hosted checks, local
browser transaction rerun, live verifier results, and retained transcripts. The fixes are local;
the hosted checks do not imply that the patched code has been deployed.

## Historical results (21 October 2026, release pass, on the pushed revision's code)

- **Contracts:** 75 local, 4 live-fork and 3 Morpho-fork tests pass. Slither: the same 33 results, all triaged. The 2 that Slither rates High (`reentrancy-balance`) are accepted: every entry point is `nonReentrant` and the callee is the native vault.
- **SDK:** 10 tests pass. **API:** 14 tests pass.
- **Build:** API, SDK, verifier, scripts and web typecheck clean; ESLint clean.
  - Production build passes; every page renders per request behind the CSP proxy.
  - A production build with any test-only variable set is refused.
  - A clean `git archive` checkout installs with the frozen lockfile (pnpm 11.5.0) and builds.
- **Independent verifier against the live v2 contracts:** 62/62, rerun before the push (`evidence/real-chain/verify-…-rerun-2026-10-21T13-49Z.txt`). Live backing is BALANCED with a discrepancy of 0.
- **Production build in a browser:**

  | Suite | Result |
  |---|---|
  | CSP | 25/25 (with the API configured) |
  | Transaction intent | 42/42 |
  | Rejection | 15/15 |
  | Wallet UI | 10/10 |
  | Keyboard | 6/6 |
  | Responsive | 120/120 |
  | axe | no violations |

- **Fork browser E2E, rerun after hardening** (`next dev` with the fork CSP):
  - All five phases pass, 21/21 checks: wrap, minted, redeem, released, pending → recipient takes shares.
  - The UI-signed Mezo transaction had a 1,500,000 gas limit and used 487,078.
- **API image, Railway-like Docker run** (from `git archive HEAD`):
  - Healthy on an injected `PORT`; `/ready` returned 503 before indexing and 200 after.
  - CORS was limited to the configured origin.
  - After a restart, the cursors persisted and no migration was re-applied. No warnings.
- **Rate-limit probe:** PASS on the default configuration; FAIL, as intended, on a deliberately misconfigured instance.
- **Real MetaMask 13.53.0** (throwaway wallet, never funded; driven by mouse and keyboard only, because LavaMoat blocks scripted access). Run against the production build behind the CSP:

  | Check | Result |
  |---|---|
  | Install, onboarding, EIP-6963 discovery (listed once) | PASS |
  | Connect approval / connect rejection | PASS / PASS |
  | Session persistence across a full browser restart | PASS: reconnected unprompted |
  | Unsupported network detection | PASS: "Unsupported (1)" |
  | Network switch from the wallet menu, rejected | PASS: "Network switch was rejected in the wallet. Nothing was changed." |
  | Network switch from the wallet menu, approved | PASS: MetaMask showed "Add Mezo Testnet" (rpc.test.mezo.org); the badge changed to "Mezo testnet" live |
  | Account not granted to the site | PASS: the app kept the granted account |
  | Account switch between two granted accounts | PASS: the header followed live |
  | Disconnect and reconnect | PASS |
  | Zero balance | PASS: the action is disabled ("Insufficient balance") |
  | Signing and rejecting a transaction in MetaMask | **NOT TESTED**: needs a funded wallet, outside the authorized transactions. What the app *asks* to sign is covered by the transaction-intent suite |

- **Not tested:**
  - Rabby and other extensions.
  - WalletConnect, especially under the CSP.
  - Screen readers.
  - Burn-transaction preparation on the public deployment: no address holds v2 rwSMUSD. It is covered on forks.
  - Hosted deployments: hosting is not approved.


## Wallet-classification hold review (26 October 2026)

See [the product review](PRODUCT_REVIEW_2026-10-26.md). Do not run transaction or fork
lifecycle scripts when the task prohibits transactions. The following new checks never
broadcast: production acceptance, product audit, responsive, axe, keyboard and CSP.
Run them from `apps/web` against a locally built production server on port 3002:

```powershell
node e2e/product-acceptance.mjs http://localhost:3002
node e2e/responsive.mjs http://localhost:3002
node e2e/axe.mjs http://localhost:3002
node e2e/keyboard.mjs http://localhost:3002
node e2e/csp.mjs http://localhost:3002
$env:AUDIT_ALL_DOCS='1'
node e2e/product-audit.mjs http://localhost:3002
```

For scripted wallet states, use a separate **development** server on port 3003. Leave all
fork/account/deployment overrides unset: the chooser needs no test-only switch, because wallet
access is enabled in every build. `wallet-states.mjs` uses explicit RPC fixtures and rejects
every write in its provider; it does not use an extension, private key or public signing
account. Do not interpret these tests as MetaMask clearance.

```powershell
node e2e/wallet-states.mjs http://localhost:3003
node e2e/settlement-history.mjs http://localhost:3003
```

`wallet-ui.mjs` checks recipient validation and that a wallet announcing itself over EIP-6963 is
listed once in the chooser, without a duplicate generic entry. The live-read
transaction-intent suite may now correctly block accounts without enough native gas;
its previous result must not be promoted to a passing current run. The corrected live-read suite now asserts a no-signing gas block when the observed account cannot afford its next transaction. Exact lock and burn
arguments are checked by the new rejecting-wallet fixture suite.


## Product-copy and FAQ follow-up

The existing production acceptance suite checks that wallet notices appear on app routes
only, the hero describes portable savings, the CTA is labelled read-only, and FAQ keyboard
interaction, desktop sticky positioning and mobile stacking work. Wallet hold enforcement
remains part of every production route assertion. `SETTLEMENT_ONLY=1` runs the four tracker
read regressions against a hosted production build without attempting a wallet connection;
the connected-history fixture remains a separate keyless development test. Actual hosted
API history is checked using its public timestamp/ID cursor. Reorg injection and restart
regressions are local API tests, not live-chain manipulations.
