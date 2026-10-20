# Testing

| Layer | Command | What it covers |
|---|---|---|
| Contracts, local | `cd packages/contracts && forge test` | Unit, fuzz (512 runs) and stateful invariants: wrapper accounting, gateway auth/replay, NAV oracle, gas griefing (F-01..F-03) |
| Contracts, fork | `RUN_FORK=true forge test --match-path "test/fork/ReachLiveFork.t.sol"` | Live Mezo vault and real Wormhole cores (guardian set substituted in fork storage) |
| Morpho, fork | `RUN_FORK_BASE_MAINNET=true forge test --match-contract MorphoCompatibilityForkTest` | Real Morpho Blue on a Base mainnet fork |
| SDK | `pnpm --filter @musd-reach/sdk test` | TS↔Solidity encoding parity, VAA digest parity with Wormholescan, exact amount math |
| Lifecycle, fork | Anvil forks on :8545/:8546; deploy with `REACH_DEPLOYMENTS=<scratch>.json`; then `npx tsx scripts/lifecycle.ts --mode fork` | Full round trip; v2 deployments add steps 12a–12d |
| Browser E2E, fork | see below | Real UI signing flows with the wagmi mock connector |
| Verifier | `pnpm verify all [evidence.json]` | Independent chain-only checks |

## Browser E2E against local forks

1. Start forks with impersonation: `anvil --fork-url https://rpc.test.mezo.org --port 8545 --chain-id 31611 --auto-impersonate`, and the same for Base Sepolia on port 8546.
2. Deploy v2 to the forks with `DeployReach.s.sol`, with `REACH_DEPLOYMENTS` pointing to a scratch file.
3. Fund a test address **on the forks only**, using `anvil_setBalance` and MUSD from an impersonated holder.
4. Start the app bound to the fork deployment. The mock connector exists only when `NEXT_PUBLIC_E2E_ACCOUNT` is set at build time:

   ```
   NEXT_PUBLIC_REACH_DEPLOYMENT="$(cat scratch.json)" NEXT_PUBLIC_MEZO_RPC=http://127.0.0.1:8545 \
   NEXT_PUBLIC_BASE_RPC=http://127.0.0.1:8546 NEXT_PUBLIC_NETWORK_MODE=fork \
   NEXT_PUBLIC_E2E_ACCOUNT=0x…E2E01 next dev -p 3001
   ```

5. Run `node apps/web/e2e/fork-flows.mjs wrap`. Then deliver with `scripts/fork-deliver.ts --dir ISSUE`, and run the `minted`, `redeem`, `released` and `pending` phases. Later phases take the tracker URL through `E2E_TRACKER`.

`fork-deliver.ts` refuses to run unless both RPCs report Anvil.

## Latest results (20 October 2026)

- **Contracts:** 72 local tests and 7 fork tests pass.
- **SDK:** 6 tests pass.
- **Build:** API, SDK and web typecheck clean. ESLint (React Compiler rules) clean. Production build passes, with 14 routes.
- **v2 fork lifecycle:** 18/18 steps pass.
- **Browser E2E on forks:** the wrap, minted, redeem, released and pending phases pass. No horizontal overflow at 390px and no uncaught page errors. E2E found and fixed two real bugs (F-06 and F-07 in `docs/SECURITY_FINDINGS.md`).
- **Not tested:**
  - Real wallet extensions such as MetaMask or Rabby.
  - The rejected-signature path, because the mock connector can't reject a transaction.
  - An axe or screen-reader accessibility audit.
  - The Docker and Railway image builds, because Docker isn't installed here.
