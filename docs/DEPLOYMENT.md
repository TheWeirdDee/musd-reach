# Deployment

**Status, 21 October 2026.**
- **Contracts:** v2 is deployed on Mezo testnet and Base Sepolia and verified (below).
- **Web app and API:** hosted by the owner on 23 October 2026. The web app is at `https://musd-reach.vercel.app` (Vercel, Hobby) and the API at `https://musd-reach-api.onrender.com` (Render, Free). The Railway section below remains as an alternative.
- **Mainnet:** none, and none is planned.

## Hosting

### Shape

| Piece | Host | Why |
|---|---|---|
| `apps/web` | Vercel | Next.js 16. Every page is rendered per request, because the CSP nonce must be fresh (`src/proxy.ts`). |
| `apps/api`, `ROLE=all` | Railway, **one service, one replica** | Long-running indexer, reconciler and relayer loops. Not suitable for serverless. A second replica would duplicate the loops. |
| Database | Railway PostgreSQL (`DATABASE_URL`), or PGlite on a Railway volume mounted at `/data` | The indexer cursor, transfers and job health live here. Without persistence, every redeploy re-indexes from the deploy blocks. |

The API is optional for the core flows. Balances, backing, wrapping, redeeming and recovery read the chains directly from the browser. The API adds indexed history, the transfer list and relaying.

### Accounts and permissions the owner must provide

| Account | Permission needed | Cost note |
|---|---|---|
| GitHub `TheWeirdDee/musd-reach` | Already pushed. Grant the Vercel and Railway GitHub apps read access to this repository only. | — |
| Vercel | Create a project from the repository | Hobby is free but for non-commercial use under Vercel's terms; check them yourself |
| Railway | Create a project with one service from the repository, plus Postgres or a volume | Railway bills by usage after any trial; no paid resource has been created |
| WalletConnect (optional) | A project id | WalletConnect under the CSP is **not tested**; leave it unset for the first launch |
| Relayer key (optional) | A new, dedicated key holding only small testnet balances | Never reuse the deployer, primary or secondary keys. Never use the exposed `0xE306…cab6` key |

### Railway: API service

Settings: builder is the Dockerfile `apps/api/Dockerfile`, from `railway.json`. The healthcheck is `/health` with a 60-second timeout, restarts on failure, and runs 1 replica.

| Variable | Value | Notes |
|---|---|---|
| `ROLE` | `all` | Splitting into `api` + `worker` services needs a shared `DATABASE_URL`, and the worker has no HTTP healthcheck |
| `PORT` | injected by Railway | The API listens on it; an explicit `API_PORT` would win |
| `DATABASE_URL` | Railway Postgres reference variable | Or leave unset and mount a volume at `/data` (PGlite at `/data/pglite`) |
| `CORS_ORIGINS` | the Vercel production URL, e.g. `https://<project>.vercel.app` | Exact origins, comma-separated. Preview URLs are not allowed unless listed |
| `CLIENT_IP_HEADER` | `x-real-ip` | Railway documents that its edge sets `X-Real-IP` to the client address. Keep it only if `scripts/check-rate-limit.mjs` passes against the hosted URL (below) |
| `TRUST_PROXY` | empty | Railway publishes no stable proxy address range to list. Never set it together with `CLIENT_IP_HEADER` (the API refuses) |
| `RATE_LIMIT_PER_MINUTE` | `120` | Per client IP |
| `RELAYER_KEY_FILE` | unset for launch | Without it the relayer only tracks, and users deliver from the transfer tracker. To enable it later, mount a volume containing the dedicated key file |
| `MEZO_TESTNET_RPC`, `BASE_SEPOLIA_RPC` (+ `_FALLBACK`) | defaults | Public RPCs. `sepolia.base.org` caps `eth_getLogs` at 200 blocks, so publicnode is the default (F-15) |
| `LOG_LEVEL` | `info` | JSON logs to stdout. Upstream failures return a generic 502 and are logged in detail (F-18) |

Restart and recovery: migrations are tracked and re-applied only if they are new. The indexer resumes from its stored cursor, and every loop backs off on errors (up to 5 minutes). `/ready` returns 503 until both indexers have succeeded within the last 10 minutes. It reports `notIndexedRecently` and the cursors; "ready" means "indexing", not "caught up". All of this was checked locally in Docker (below), not on Railway.

### Render: API service (what is actually hosted)

The API runs on Render: `https://musd-reach-api.onrender.com`, created by the owner on 23 October 2026.

- **Service:** Web Service, Docker runtime, Dockerfile Path `./apps/api/Dockerfile`, build context `.`, health check `/health`, Free instance.
- **Variables:**
  - `ROLE=all`, `LOG_LEVEL=info`.
  - `CORS_ORIGINS` set to the exact Vercel URL.
  - `CLIENT_IP_HEADER=cf-connecting-ip`, then `RATE_LIMIT_PER_MINUTE=120`.
  - Leave `API_PORT`, `TRUST_PROXY`, `DATABASE_URL` and `RELAYER_KEY_FILE` unset. Render injects `PORT`, and an explicit `API_PORT` would override it.
- **Client IP on Render.** Render's edge is Cloudflare (`Server: cloudflare`, `CF-RAY`). Measured on the live service on 23 October:
  - Client-set `X-Forwarded-For`, `X-Real-IP` and `True-Client-IP` pass through unchanged, so the API must never trust them.
  - A client-set `CF-Connecting-IP` is refused at the edge with 403. The `CF-Connecting-IP` the container receives therefore comes from Cloudflare, which makes it safe as `CLIENT_IP_HEADER`.
  - Without it, the API keys on the socket address, which is the edge's. That is safe, but all visitors share one bucket.
  - `scripts/check-rate-limit.mjs` checks the 403, then sends twice the limit with rotating forged headers. It passes only if about one limit's worth is served.
- **Free tier:** the service sleeps after 15 minutes without traffic and wakes in about a minute, and its filesystem is ephemeral. The embedded database is therefore rebuilt from the chain after each wake; `/ready` reports 503 until both indexers have run. Free Render Postgres expires after 30 days (around 22 November for a database created now, the day before the demo), so it is not used. The web app's balances, backing, actions, recovery and proof pages do not depend on the API.

### Vercel: web project

Settings: Root Directory is `apps/web`. `apps/web/vercel.json` installs and builds from the repository root and syncs the deployment and evidence into the build first.

| Variable | Value | Notes |
|---|---|---|
| `ENABLE_EXPERIMENTAL_COREPACK` | `1` | Lets Vercel use the pnpm version in `package.json` (`pnpm@11.5.0`). Vercel documents Corepack as experimental; confirm the first build log says pnpm 11 |
| `NEXT_PUBLIC_API_URL` | the Railway public URL (`https://…`) | Added to the CSP `connect-src` automatically. With every endpoint on https, the CSP adds `upgrade-insecure-requests` |
| `NEXT_PUBLIC_SITE_URL` | the production URL | Server-side fallback for WalletConnect metadata; browsers use the real origin |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | unset for launch | When set, the CSP adds WalletConnect relay, verify and explorer origins. Not tested |
| `NEXT_PUBLIC_MEZO_RPC`, `NEXT_PUBLIC_BASE_RPC` | unset | Optional dedicated RPCs. They are added to the CSP automatically |
| `NEXT_PUBLIC_E2E_ACCOUNT`, `NEXT_PUBLIC_REACH_DEPLOYMENT`, `NEXT_PUBLIC_NETWORK_MODE` | **never** | Test-only. `next build` refuses to run with any of them set, and production bundles ignore them |

Security headers come from `next.config.ts` and `src/proxy.ts`:
- A per-request nonce CSP: `script-src 'self' 'nonce-…' 'strict-dynamic'`, with no `unsafe-inline` or `unsafe-eval`.
- `style-src` limited to `'self'` and the nonce.
- `connect-src` limited to the configured RPCs and API.
- `frame-ancestors 'none'` and `object-src 'none'`.
- Also: `X-Frame-Options: DENY`, `nosniff`, a referrer policy and a permissions policy.

### Order of operations

1. Railway: create Postgres, then the API service with the variables above. Wait until `/ready` returns 200.
2. Vercel: create the project with `NEXT_PUBLIC_API_URL` set to the Railway URL, then deploy.
3. Railway: set `CORS_ORIGINS` to the final Vercel URL and redeploy.
4. Run every check below against the **hosted** URLs. Do not announce the site until they all pass.

### Post-deploy checks (all read-only)

```bash
API=https://<railway-host>  WEB=https://<vercel-host>
curl -s $API/health && curl -s $API/ready                 # 200 and ready:true once indexed
node scripts/check-rate-limit.mjs $API 120                # PASS: forged X-Forwarded-For / X-Real-IP cannot bypass
                                                          # FAIL: unset CLIENT_IP_HEADER, redeploy, rerun
curl -sI -H "Origin: https://evil.invalid" $API/health | grep -i access-control   # must print nothing
node apps/web/e2e/csp.mjs $WEB                            # nonce CSP, zero violations on every route, injection refused
node apps/web/e2e/axe.mjs $WEB                            # NO VIOLATIONS
node apps/web/e2e/tx-intent.mjs $WEB                      # exact approvals, targets and chain ids (keyless; nothing is signed)
node apps/web/e2e/rejection.mjs $WEB && node apps/web/e2e/wallet-ui.mjs $WEB
pnpm verify all evidence/real-chain/testnet-2026-10-21T11-23-33-084Z.json    # independent of both hosts
```

Then do one manual pass on a phone and a desktop with a real wallet: connect, switch network, and reject one signature. Real transaction signing stays unverified until a funded test wallet is authorized.

### Validated locally on 21 October 2026

- **Clean checkout:** `git archive HEAD` with the Vercel install and build commands. The frozen-lockfile install used pnpm 11.5.0, and the build succeeded with the proxy.
- **API image** (WSL Docker 29.1, from `git archive HEAD`):
  - 117 MB, non-root, healthy on an injected `PORT=9000`.
  - `/ready` returned 503 before indexing and 200 after.
  - CORS admitted only the configured origin.
  - After `docker restart`, the cursors were unchanged and no migration was re-applied. There were no warnings or errors.
- **Rate-limit probe:**
  - Passed against the default local configuration (429 at request 121).
  - **Failed**, as intended, against a deliberately misconfigured API (`CLIENT_IP_HEADER` with no edge in front).
- **Production web build behind the CSP:** CSP 25/25, transaction intent 42/42, rejection 15/15, wallet UI 10/10, keyboard 6/6, and axe reported no violations on any route at 1280 and 390 px. Checked both without the API and with a local API.

## Contract deployment procedure (as executed for v1 and v2)

### Prerequisites (owner actions)

1. **Deployer key, never committed and never printed.** Import it into Foundry's encrypted keystore:
   `cast wallet import reach-deployer --interactive`
2. **Mezo testnet BTC for gas.** Get it from the Mezo testnet faucet (may require a CAPTCHA). `forge script` prints an estimated gas total for each step before you add `--broadcast`; run it once without `--broadcast` to see the cost.
3. **Base Sepolia ETH for gas.** Covers the destination gateway deploy, the bind, and delivery and burn transactions during the run.
4. **Test MUSD for the canonical run.** About 5 MUSD in the primary wallet on Mezo testnet, for example by opening a testnet MUSD borrowing position against testnet BTC. How to obtain it was not verified in this repository.
5. **A second key (secondary holder)** with a little Base Sepolia ETH, used for the receipt-transfer step. The runner can top it up from the primary key.

### Deploy (4 transactions across 2 chains)

```bash
cd packages/contracts
forge script script/DeployReach.s.sol --sig "deployWrapper()"     --rpc-url mezo_testnet --account reach-deployer --broadcast
forge script script/DeployReach.s.sol --sig "deployDestination()" --rpc-url base_sepolia --account reach-deployer --broadcast
forge script script/DeployReach.s.sol --sig "deploySource()"      --rpc-url mezo_testnet --account reach-deployer --broadcast
forge script script/DeployReach.s.sol --sig "bindDestination()"   --rpc-url base_sepolia --account reach-deployer --broadcast
```

The script fails closed if the native vault implementation is not the pinned `0x92D1…D98C`, if the vault underlying is not MUSD, or if either Wormhole Core reports an unexpected chain id. Addresses are written to `deployments/testnet.json`.

Optionally set `REACH_GUARDIAN=<address>` to give pause rights to an address other than the deployer.

### Verify the deployment

```bash
pnpm verify deployment     # wiring: peers, receipt minter, wrapper binding, chain ids
pnpm verify reconcile      # all zero, BALANCED
```

Contract source verification on Blockscout (Mezo) and Basescan or Blockscout (Base Sepolia) uses `forge verify-contract`.

### Canonical run

```bash
export REACH_PRIVATE_KEY_FILE=/secure/path/primary.key
export REACH_SECONDARY_KEY_FILE=/secure/path/secondary.key
pnpm --filter @musd-reach/scripts lifecycle -- --mode testnet --amount 5
```

The runner executes the checked steps below (v2 adds 12a to 12d, 18 in total) and writes `evidence/real-chain/<run>.json`:

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

### Rollback

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
