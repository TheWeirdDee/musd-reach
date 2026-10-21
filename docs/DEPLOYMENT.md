# Deployment and the canonical public-testnet run

None of this has been executed on public networks yet. Each step below needs explicit authorization from the repository owner.

## Prerequisites (owner actions)

1. **Deployer key, never committed and never printed.** Import it into Foundry's encrypted keystore:
   `cast wallet import reach-deployer --interactive`
2. **Mezo testnet BTC for gas.** Get it from the Mezo testnet faucet (may require a CAPTCHA). `forge script` prints an estimated gas total for each step before you add `--broadcast`; run it once without `--broadcast` to see the cost.
3. **Base Sepolia ETH for gas.** Covers the destination gateway deploy, the bind, and delivery and burn transactions during the run.
4. **Test MUSD for the canonical run.** About 5 MUSD in the primary wallet on Mezo testnet, for example by opening a testnet MUSD borrowing position against testnet BTC. How to obtain it was not verified in this repository.
5. **A second key (secondary holder)** with a little Base Sepolia ETH, used for the receipt-transfer step. The runner can top it up from the primary key.

## Deploy (4 transactions across 2 chains)

```bash
cd packages/contracts
forge script script/DeployReach.s.sol --sig "deployWrapper()"     --rpc-url mezo_testnet --account reach-deployer --broadcast
forge script script/DeployReach.s.sol --sig "deployDestination()" --rpc-url base_sepolia --account reach-deployer --broadcast
forge script script/DeployReach.s.sol --sig "deploySource()"      --rpc-url mezo_testnet --account reach-deployer --broadcast
forge script script/DeployReach.s.sol --sig "bindDestination()"   --rpc-url base_sepolia --account reach-deployer --broadcast
```

The script fails closed if the native vault implementation is not the pinned `0x92D1…D98C`, if the vault underlying is not MUSD, or if either Wormhole Core reports an unexpected chain id. Addresses are written to `deployments/testnet.json`.

Optionally set `REACH_GUARDIAN=<address>` to give pause rights to an address other than the deployer.

## Verify the deployment

```bash
pnpm verify deployment     # wiring: peers, receipt minter, wrapper binding, chain ids
pnpm verify reconcile      # all zero, BALANCED
```

Contract source verification on Blockscout (Mezo) and Basescan or Blockscout (Base Sepolia) uses `forge verify-contract`.

## Canonical run

```bash
export REACH_PRIVATE_KEY_FILE=/secure/path/primary.key
export REACH_SECONDARY_KEY_FILE=/secure/path/secondary.key
pnpm --filter @musd-reach/scripts lifecycle -- --mode testnet --amount 5
```

The runner executes 14 checked steps and writes `evidence/real-chain/<run>.json`:

| Step | Action |
|---|---|
| 00 | Preflight checks |
| 01 | Exact approval |
| 02 | Real deposit → native vault → wSMUSD → lock → ISSUE |
| 03 | Guardian-signed VAA from Wormholescan |
| 04 | Altered-VAA rejection (simulation) |
| 05 | Mint on Base |
| 06 | Replay rejection |
| 07 | Transfer to a second holder |
| 08 | Two burns (shares mode and MUSD mode) |
| 09 | REDEEM VAAs after Base finality |
| 10 | Wrong-emitter-chain rejection |
| 11 | Release of shares, plus MUSD redemption |
| 12 | REDEEM replay rejection |
| 13 | Reconciliation |

Then run:

```bash
pnpm verify all evidence/real-chain/<run>.json
node scripts/sync-web-data.mjs     # publish the run to the website's proof explorer
```

## Backend (optional for the UI)

`apps/api` needs persistent hosting, such as Railway, Fly.io, Render or a VM, plus PostgreSQL (`DATABASE_URL`). Without `DATABASE_URL` it uses embedded PGlite on disk. `ROLE=api|worker|all`. Health checks are at `/health` and `/ready`. Do not host the indexer on serverless functions.

## Frontend

`apps/web` is a static-first Next.js 16 app. Its environment:

- `NEXT_PUBLIC_API_URL` (optional)
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` (optional)
- `NEXT_PUBLIC_MEZO_RPC` / `NEXT_PUBLIC_BASE_RPC` (optional overrides)

Run `node scripts/sync-web-data.mjs` before `next build`.

## Hosting configuration (prepared, not deployed)

| Target | File | Notes |
|---|---|---|
| Vercel (web) | `apps/web/vercel.json` | Set the project root directory to `apps/web`. Install and build run from the repo root, and the build syncs proof data first. Env: `NEXT_PUBLIC_API_URL`, optionally `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`. **Never** set `NEXT_PUBLIC_E2E_ACCOUNT` in production. |
| Railway (API + indexer) | `railway.json`, `apps/api/Dockerfile` | Health check `/health`. Mount a volume at `/data` for PGlite, or set `DATABASE_URL` to a Railway Postgres. Set `CORS_ORIGINS` to the Vercel URL. Set `TRUST_PROXY` to the address range Railway's edge connects from, confirmed from the `/health` request logs of the first deploy. Leave it empty if unsure: rate limiting then falls back to the socket address, which is safe but groups clients behind the proxy (F-18). Optionally `RELAYER_KEY_FILE` (a mounted secret) to auto-deliver signed messages. |

The Docker image was built from `git archive HEAD` and smoke-tested under Docker 29.1 in WSL. It ran healthy as non-root, every job was OK, and reconciliation was BALANCED against the live chains. Railway itself has not been used.

**Before public hosting:**
- Add a Content-Security-Policy. `next.config.ts` sets nosniff, a referrer policy, `X-Frame-Options: DENY` and a permissions policy, but no CSP yet. A CSP needs testing against wagmi, WalletConnect and the RPC origins.
- Keep `NEXT_PUBLIC_E2E_ACCOUNT` unset in production.
- If the relayer is enabled, use a dedicated low-balance key.

## Rollback

Contracts are immutable. Rollback means deploying a new set and moving the frontend to it. Existing receipts remain redeemable on the old set forever, since exits cannot be paused.

---

# v2 deployment and public verification (executed 21 October 2026)

v2 changes `ReachSourceGateway` (pending settlements, out-of-gas guard) and `ReachSavingsWrapper` (out-of-gas guards on its best-effort calls). Peers are immutable and the v1 destination is bound one-time to the v1 source, so **all four contracts are redeployed**. The v1 contracts stay live and redeemable. The app switches to v2 by replacing `deployments/testnet.json`, with the v1 file archived as `deployments/testnet-v1.json`.

The previous public run is historical evidence about v1 only. It is not evidence for v2.

## Result

| Contract | Chain | Address | Deploy block |
|---|---|---|---|
| ReachSavingsWrapper (wSMUSD) | Mezo testnet | `0xf8cF6fCCC7bcF2860BfAD1Ea4A6018D446eb4306` | 16279234 |
| ReachSourceGateway | Mezo testnet | `0xA5c70F8D6B329ED6c2d15D604B66FafC3A6C96d3` | 16279265 |
| ReachDestinationGateway | Base Sepolia | `0x50436eB8F8213c7df773F2c331Bb41e1fecb5a23` | 48406337 |
| RemoteWrapperReceipt (rwSMUSD) | Base Sepolia | `0x02777A938e69f848d4413b9033D225f0D1444e89` | 48406337 |

- **Wiring and bytecode:**
  - `pnpm verify deployment` passes.
  - `pnpm verify bytecode` matches every runtime bytecode to the build, with immutables masked.
- **Run:** `evidence/real-chain/testnet-2026-10-21T11-23-33-084Z.json`.
  - All 18 steps pass, with no reused transactions.
  - The run used 6 MUSD, which came back as 3 MUSD to the primary and 3 wSMUSD to the secondary.
- **Verifier:** `reach-verify all` passes 62/62, rerun on 21 October. The transcript is in `evidence/real-chain/verify-testnet-2026-10-21T11-23-33-084Z.txt`.

The plan below is kept as executed.

## Preconditions (read on 20 October 2026, before the deploy)

| Item | Current | Needed |
|---|---|---|
| Primary Mezo BTC | 0.0099999 | Mezo gas is ~146 wei; the whole plan costs far less than 0.001 BTC |
| Primary Base Sepolia ETH | 0.00957 | The v1 deploy plus run used ≈ 0.0003 |
| Primary MUSD | 1,797.5 | 6 for the run |
| Secondary Base ETH | 0.00029 | Covers one burn; the runner tops it up if below 0.0002 |

## A. Deploy v2: 4 transactions

| # | Chain | Call |
|---|---|---|
| A1 | Mezo testnet | `deployWrapper()`: new ReachSavingsWrapper. Fails closed unless the vault implementation is still `0x92D1…D98C`. |
| A2 | Base Sepolia | `deployDestination()`: new ReachDestinationGateway and RemoteWrapperReceipt |
| A3 | Mezo testnet | `deploySource()`: new ReachSourceGateway |
| A4 | Base Sepolia | `bindDestination()` (one-time) |

Then run `pnpm verify deployment` (read-only). Every wiring check should PASS, and the record should show `settlementModel: "pending-v2"`.

## B. Canonical v2 run: about 13 transactions, 6 MUSD

```
pnpm --filter @musd-reach/scripts lifecycle -- --mode testnet --amount 6
```

| Step | Chain | Transactions |
|---|---|---|
| 01 | Mezo | Approve 6 MUSD (exact amount) |
| 02 | Mezo | `depositAndIssue` |
| 05 | Base | `receiveIssue` |
| 07 | Base | Transfer 3 rwSMUSD to the secondary, plus a gas top-up for the secondary if it is below 0.0002 ETH |
| 08 | Base | Three burns: secondary in shares mode; primary in MUSD mode; primary in MUSD mode with a deliberately unreachable minimum |
| 11 | Mezo | Three `receiveRedeem` deliveries. The third must become a pending settlement. |
| 12d | Mezo | Primary calls `settleWithMinAssets` at the then-current NAV |

Steps 04, 06, 10, 12, 12b and 12c are read-only simulations, and step 13 is reconciliation. After the run:

```
pnpm verify all evidence/real-chain/<new run>.json
node scripts/sync-web-data.mjs
```

**Pass criteria:**
- All 18 steps PASS, and the verifier passes every check.
- **12a:** the pending entry exists, and the recipient's MUSD and wSMUSD are unchanged.
- **12b / 12c:** they revert with `SlippageExceeded` and `NotRecipient`.
- **12d:** MUSD is paid once, and the pending total is cleared.
- **13:** reconciliation is BALANCED, with custody ≥ locked + pending.

**Not verifiable on public testnet** (local and fork evidence only): the out-of-gas guard under an expensive native strategy (F-01). Reproducing it publicly would require the Mezo vault owner to install such a strategy.

## Not planned

- No mainnet deployment.
- No changes to the v1 contracts; they have no admin.
- No testnet loan repayment without separate approval (`docs/LOAN_AUDIT.md`).
