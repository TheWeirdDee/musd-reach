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
| API | `pnpm --filter @musd-reach/api test` | HTTP policy: proxy trust, rate-limit spoofing, error mapping (F-18) |
| Wallet rejection | `node apps/web/e2e/rejection.mjs [url]` | Scripted EIP-1193 wallet rejecting with 4001: rejected signature, rejected switch, wallet on an unsupported chain (F-17) |
| Wallet UI | `node apps/web/e2e/wallet-ui.mjs [url]` | Recipient validation; an EIP-6963 wallet listed once (F-16) |
| Accessibility | `node apps/web/e2e/axe.mjs [url]` and `e2e/keyboard.mjs` | axe-core WCAG 2.1 AA on every route; keyboard order and visible focus |

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

## Latest results (21 October 2026)

- **Contracts:** 75 local tests and 7 fork tests pass. Slither rerun: same 33 triaged results, no high.
- **SDK:** 10 tests pass. **API:** 5 tests pass.
- **Build:** API, SDK, verifier, scripts and web typecheck clean. ESLint clean. Production build passes, with 14 routes.
- **v2 public run:** 18/18 steps (`evidence/real-chain/testnet-2026-10-21T11-23-33-084Z.json`). `reach-verify all`: 62/62, transcript saved beside the evidence.
- **Browser E2E on forks:** wrap, minted, redeem, released and pending phases pass, with no horizontal overflow at 390px and no uncaught page errors. A UI-signed Mezo transaction carried the 1.5M gas floor (F-20).
- **Wallet rejection E2E:** 14/14. **Wallet UI E2E:** 10/10. The wallet-UI checks fail on the pre-fix code in the four expected places.
- **Accessibility:** axe reports no violations on any route. The keyboard check passes 6/6.
- **API Docker image** (WSL Ubuntu 24.04, Docker 29.1, built from `git archive HEAD`): about 117 MB, runs as non-root `reach`, healthy. Every indexer and relay job is OK, reconciliation is BALANCED against the live chains, and the logs show no warnings.
- **Real MetaMask 13.53.0** (Chromium via Playwright, a throwaway wallet that was never funded). LavaMoat blocks script access to the extension, so it was driven only by mouse and keyboard input at screen coordinates.

  | Check | Result |
  |---|---|
  | Install and onboarding | PASS |
  | EIP-6963 discovery | PASS (listed once after the F-16 fix) |
  | Connect approval | PASS |
  | Connect rejection | PASS: "Connection request was rejected in the wallet. Nothing was changed." |
  | Network detection | PASS after the F-17 fix: "Unsupported (1)" |
  | Zero balance | PASS: the action is disabled with "Insufficient balance" |
  | Signing and rejecting a transaction in MetaMask | NOT TESTED: needs a funded wallet, which is outside the authorized transactions |

- **Not tested:**
  - Rabby and other extensions.
  - Screen readers.
  - Hosted deployments: hosting is not approved.
