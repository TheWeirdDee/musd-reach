# MUSD Reach

**Save on Mezo. Reach further.**

MUSD Reach makes Mezo savings positions portable across chains. It is built for Mezo savers and developers building applications that can recognize a Mezo-backed savings claim. Keep the underlying savings position on Mezo, lock wrapper shares, and hold or transfer a backed receipt on Base Sepolia. Burn that receipt to return to the source position.

The goal is cross-chain utility without automatically unwinding the original savings position. This release demonstrates the protocol on public testnets; receiving-application integrations remain future work.

**Deployment: Mezo testnet + Base Sepolia**

[Live app](https://musd-reach.vercel.app/app) | [Public proof](https://musd-reach.vercel.app/proof) | [Docs](https://musd-reach.vercel.app/docs) | [Contract registry](https://musd-reach.vercel.app/contracts) | [API health](https://musd-reach-api.onrender.com/health)

## The problem

MUSD savings positions normally stay on the chain where they were created. Moving their value elsewhere often means withdrawing from savings and bridging the underlying token, giving up the original savings position.

## The solution

Reach lets a Mezo saver lock wrapper shares and receive a backed, transferable claim on Base Sepolia. The savings position stays on Mezo while its claim becomes portable. Hold or transfer the claim, then burn it to redeem the corresponding source position.

Current scope: a portable savings-backed receipt on Mezo testnet and Base Sepolia, with a publicly verified round trip. No independently deployed Morpho market, borrowing product or third-party adoption is established. MUSD held on Base must first reach Mezo through a separate bridge; Reach does not automate that entry.

## How it works

1. **Wrap.** MUSD is deposited into the native vault through the wrapper. You receive wSMUSD at the current share price. You can also bring existing sMUSD with `depositSavings`; yield it accrued before the deposit stays claimable by you.
2. **Make portable.** Your wSMUSD is locked in the source gateway, which publishes an ISSUE message. Wrap and lock can be one transaction.
3. **Issue.** Once the Wormhole guardians sign the message (a VAA), anyone delivers it to the destination gateway on Base. The gateway verifies the signature, the emitter, the chains and every payload field, consumes the transfer id, and mints exactly that many rwSMUSD.
4. **Use.** rwSMUSD is an ordinary ERC-20 with permit. Transfer it or hold it. The v2 run transferred it to a second holder.
5. **Redeem.** Burn rwSMUSD on Base. Choose wSMUSD shares or MUSD, with a minimum amount for MUSD. A REDEEM message is published.
6. **Release.** After Base finality, anyone delivers the REDEEM VAA on Mezo. The source gateway releases the exact shares, or redeems them through the wrapper and pays MUSD if at least your minimum is available.
7. **Recover if needed.** A MUSD payout that cannot meet its terms remains pending. Anyone can retry the original terms; only the recipient can lower the minimum or claim shares instead. Delivery of the message alone does not prove the payout completed. See [Redemption and recovery](#redemption-and-recovery).

## Why the wrapper is necessary

Native sMUSD tracks yield per address, so moving sMUSD itself would separate the principal from its yield. The wrapper owns the sMUSD and turns principal plus yield into a single share price. For one whole wSMUSD, read `convertToAssets(10**18)` on the wrapper: the result is in MUSD base units (18 decimals). rwSMUSD represents the same number of locked wrapper-share units, rather than a fixed MUSD amount. Share pricing includes pending native yield as well as principal and claimed yield. The native vault reports principal at 1:1, so this accounting does not proactively mark down an impaired vault; a loss or liquidity problem can instead appear as a failed withdrawal. See the economic model for that limitation.

| Token | Chain | What it is |
|---|---|---|
| MUSD | Mezo | Mezo's stablecoin |
| sMUSD | Mezo | Native savings vault position. Principal is 1:1 with MUSD; yield is tracked per address and claimed separately |
| **wSMUSD** | Mezo | ERC-4626 share of `ReachSavingsWrapper`. Its value is principal plus claimed and pending yield, so it can move between holders and chains |
| **rwSMUSD** | Base Sepolia | Claim on exactly one wSMUSD unit locked in `ReachSourceGateway` |

### Yield accounting

Full model: [`docs/ECONOMIC_MODEL.md`](docs/ECONOMIC_MODEL.md).

- **Wrapper assets:** `principal + idle + pending`. Principal and claimed yield are tracked internally, not read from `balanceOf`, so donations sent to the wrapper cannot move the share price.
- **Harvest first:** every deposit and exit harvests native yield before pricing. A newcomer cannot buy into yield that belongs to existing holders.
- **Claim-and-hold:** harvested yield stays as MUSD and is not reinvested. There are no fees and no admin mint.
- **Yield evidence:** the recorded public round trip does not demonstrate positive savings yield. Yield-bearing scenarios are tested locally and on forks. Quotes read the actual wrapper NAV; the app promises no APY.

Cross-chain conservation, checked by anyone with `pnpm verify reconcile`:

```
locked wSMUSD = rwSMUSD supply + in-flight issues + in-flight redemptions
custody wSMUSD >= locked + pending MUSD settlements
```

## Verified public-testnet results

The v2 public run passed 18 steps, including transfer to a second holder, return in shares and MUSD, a parked settlement and recipient recovery. The read-only verifier checks registry facts, deployed wiring, runtime bytecode, backing, receipts and VAA signatures.

| Level | What |
|---|---|
| **Public testnet (v2)** | Wrap, lock, ISSUE, mint, ERC-20 transfer to a second holder, burn, REDEEM, release in shares and in MUSD, pending settlement and recipient settlement; forged, replayed and wrong-chain messages rejected by the live contracts |
| **Fork only** | Full lifecycle against the live Mezo vault and the real Wormhole Cores; Morpho Blue market acceptance, borrow and liquidation on a Base mainnet fork |
| **Local only** | Fuzz and invariant tests, yield-bearing scenarios, vault impairment, 10-year liveness |
| **Historical real-wallet checks (MetaMask 13.53.0)** | Connect and reject, session persistence, unsupported-network detection, network switch (approved and rejected), account switching, behind the production CSP |
| **Scripted wallet coverage** | EIP-1193/EIP-6963 fixtures exercise the Rabby, MetaMask and Coinbase chooser paths, connection rejection and switching; these are keyless simulations, not tests of the actual wallet extensions |
| **Not verified** | Any independent integrator; Morpho on a public network; signing or rejecting a transaction inside a real wallet (what the app asks to sign is checked by a keyless test wallet); real Rabby or Coinbase Wallet sessions; an end-to-end WalletConnect session; screen readers |

## Architecture

```mermaid
flowchart LR
  subgraph Mezo["Mezo testnet (31611)"]
    U["User: MUSD or sMUSD"] -->|deposit| W["ReachSavingsWrapper / wSMUSD"]
    W -->|holds savings principal| V["Native sMUSD vault"]
    W -->|lock shares| S["ReachSourceGateway"]
    S -->|publish ISSUE| CM["Mezo Wormhole Core"]
    S -->|verify REDEEM VAA| CM
    S -->|release or redeem| U
  end
  subgraph Base["Base Sepolia (84532)"]
    D["ReachDestinationGateway"] -->|verify ISSUE VAA| CB["Base Wormhole Core"]
    D -->|mint| R["rwSMUSD / transferable receipt"]
    R -->|burn through gateway| D
    D -->|publish REDEEM| CB
  end
  CM -.->|guardians sign ISSUE| I["ISSUE VAA"]
  I -.->|anyone delivers| D
  CB -.->|guardians sign REDEEM| B["REDEEM VAA"]
  B -.->|anyone delivers| S
```

Off-chain parts are optional conveniences: `apps/api` indexes events and can run a permissionless relayer, and `apps/web` is the interface. Neither has authority to choose who receives locked funds; delivery executes authenticated messages. A configured relayer key pays its own network gas.

## Features

- MUSD wrapping, existing-sMUSD entry and optional wrap-and-lock in one transaction.
- A transferable ERC-20 receipt with permit, backed by locked wrapper shares.
- Share or MUSD redemption, recipient-controlled pending-settlement recovery and in-kind wrapper exits.
- Portfolio, quotes, transfer tracking, paginated history, public proof and a contract registry.
- A permissionless delivery path and a verifier that reads chains without trusting the Reach API.

## Challenges encountered

| Challenge | Implementation and evidence |
|---|---|
| Native yield and share pricing | Native sMUSD yield belongs to addresses. The wrapper prices tracked principal, idle MUSD and pending yield, harvests before pricing, and ignores donations. [Economic model](docs/ECONOMIC_MODEL.md), wrapper unit/fuzz/invariant tests |
| Backing across asynchronous chains | Lock/issue and burn/release are separate transactions. The SDK and verifier reconcile locked shares, receipt supply and both in-flight directions instead of equating custody with supply. [SDK](packages/sdk/src), [verifier](packages/verifier/src) |
| Authentication and replay rejection | Gateways verify Wormhole signatures, peer emitters, chain/gateway/token domains and direction; both transfer IDs and VAA digests are consumed once. [Gateway base](packages/contracts/src/shared/ReachGatewayBase.sol), public negative checks |
| Relayer gas starvation | v1 could turn a MUSD exit into a share payout. v2 separates pending settlement from payout and uses gas guards so insufficient gas reverts without changing the outcome. [F-01 to F-03](docs/SECURITY_FINDINGS.md) |
| Failed MUSD settlement | The original minimum stays binding; retries are permissionless, while only the recipient can change the minimum or take shares. The tracker requires a successful pending-state read before declaring payout complete. [Recovery](#redemption-and-recovery), [review](docs/REVIEW_2026-10-25.md) |
| Reorgs and reinclusion | Indexing atomically rewinds its cursor with orphan-event deletion, removes orphan-derived transfers, refreshes replacement origins and invalidates stale signatures. [Indexer](apps/api/src/indexer.ts), API regression tests |
| History boundaries | A timestamp-plus-transfer-ID cursor orders origins across chains without skipping transfers within one block; the UI loads and deduplicates older pages. [Routes](apps/api/src/routes.ts), [history](apps/web/src/app/app/history/page.tsx) |
| Backend cold starts | Readiness reports indexing state, adaptive log windows speed catch-up, and the interface exposes delayed API availability. Free hosting can still take about a minute to wake. [Deployment runbook](docs/DEPLOYMENT.md) |
| Wallets and understandable transactions | Named EIP-6963 providers avoid an ambiguous injected-wallet choice. Writes switch networks, simulate, check gas funds, request signing and inspect the receipt. The MetaMask classification remains unresolved. [Wallet status](#wallet-functionality) |
| Accessibility | Responsive layouts, visible focus, reduced-motion handling and a focus-trapped wallet chooser are implemented. Playwright/axe and keyboard checks provide automated coverage; screen-reader and independent usability reviews remain unverified. [Testing](docs/TESTING.md) |

## How we built it

We started with the native vault's verified ABI, proxy implementation and actual yield semantics rather than treating sMUSD as a conventional appreciating share. That investigation shaped the wrapper's tracked-asset model and the conservation invariants used by contracts, SDK reads and the verifier. Foundry tests exercise rounding, yield, failure recovery, gas griefing and long-delayed delivery; live-vault forks check assumptions against the deployed dependencies.

The gateways then made issuance and redemption explicit authenticated messages, with one-time peer binding, domain checks and replay protection. The v1 gas-starvation finding led to the v2 pending-settlement model. v1 remains disclosed; the current registry points to v2. A separate public-testnet lifecycle recorded transactions and guardian-signed VAAs, including second-holder transfers and recovery, and the read-only verifier checks those records against chain state.

The TypeScript SDK supplies common message codecs, reads, gas policy and reconciliation. The Fastify API adds event indexing, reorg recovery, history and optional permissionless relay delivery; PostgreSQL or embedded PGlite stores its state. The Next.js interface uses the same SDK for quotes and on-chain reads, while separating transaction confirmation, message delivery and final payout. Later review corrected settlement-read errors, reorg derivation and history pagination. QA combines contract/SDK/API checks, localhost-fork browser transactions, hosted keyless transaction-intent tests, CSP, accessibility and responsive checks. These evidence layers establish different facts; none substitutes for real-extension signing or an external security audit.

## Technology stack

Versions below are the checked-in pins or dependency ranges, not promises that every environment resolves the same transitive versions.

| Layer | Verified implementation | Source |
|---|---|---|
| Networks | Mezo testnet and Base Sepolia | [Deployment registry](deployments/testnet.json) |
| Messaging | Wormhole Core; guardian-signed VAAs, permissionless delivery | [Gateway base](packages/contracts/src/shared/ReachGatewayBase.sol) |
| Contracts | Solidity 0.8.28; vendored native-vault source 0.8.33; OpenZeppelin; Foundry/forge-std; London EVM target | [Foundry config](packages/contracts/foundry.toml) |
| Web | Next.js 16.4.2, React 19.3.0, TypeScript 5, Tailwind CSS 4; GSAP and Motion | [Web manifest](apps/web/package.json) |
| Wallets and chain reads | Wagmi 2, Viem 2, TanStack Query 5; EIP-6963 injected providers and WalletConnect connector | [Web manifest](apps/web/package.json), [wallet configuration](apps/web/src/lib/wagmi.ts) |
| SDK and verifier | TypeScript, Viem, tsx; workspace SDK and independent CLI | [SDK manifest](packages/sdk/package.json), [verifier manifest](packages/verifier/package.json) |
| Backend | Node.js (root requirement >=20; container Node 22), TypeScript, Fastify 5, Zod | [Root manifest](package.json), [API manifest](apps/api/package.json), [Dockerfile](apps/api/Dockerfile) |
| Database and indexer | PostgreSQL via pg, or embedded PGlite; custom finality/reorg-aware Viem event indexer | [Database](apps/api/src/db.ts), [indexer](apps/api/src/indexer.ts) |
| Testing | Foundry unit/fuzz/invariant/fork tests; Vitest 3; Playwright 1.56.1; axe-core 4.10.3; ESLint 9 and TypeScript checks | [Testing guide](docs/TESTING.md), workspace manifests |
| Workspace and hosting | pnpm 11.5.0/Corepack; Vercel web; Render API with Docker | [Root manifest](package.json), [Vercel config](apps/web/vercel.json), [deployment guide](docs/DEPLOYMENT.md) |

## Supported networks and contracts

| | Chain | EVM id | Wormhole id |
|---|---|---|---|
| Source | Mezo testnet | 31611 | 50 |
| Destination | Base Sepolia | 84532 | 10004 |

**Current deployment (v2)** — [`deployments/testnet.json`](deployments/testnet.json)

| Contract | Chain | Address | Deploy block |
|---|---|---|---|
| `ReachSavingsWrapper` (wSMUSD) | Mezo testnet | [`0xf8cF6fCCC7bcF2860BfAD1Ea4A6018D446eb4306`](https://explorer.test.mezo.org/address/0xf8cF6fCCC7bcF2860BfAD1Ea4A6018D446eb4306) | 16279234 |
| `ReachSourceGateway` | Mezo testnet | [`0xA5c70F8D6B329ED6c2d15D604B66FafC3A6C96d3`](https://explorer.test.mezo.org/address/0xA5c70F8D6B329ED6c2d15D604B66FafC3A6C96d3) | 16279265 |
| `ReachDestinationGateway` | Base Sepolia | [`0x50436eB8F8213c7df773F2c331Bb41e1fecb5a23`](https://sepolia.basescan.org/address/0x50436eB8F8213c7df773F2c331Bb41e1fecb5a23) | 48406337 |
| `RemoteWrapperReceipt` (rwSMUSD) | Base Sepolia | [`0x02777A938e69f848d4413b9033D225f0D1444e89`](https://sepolia.basescan.org/address/0x02777A938e69f848d4413b9033D225f0D1444e89) | 48406337 |

Pinned dependencies (verified live, [`docs/PROTOCOL_VERIFICATION.md`](docs/PROTOCOL_VERIFICATION.md)): Mezo MUSD `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503`, native vault proxy `0x6f461c68B2c5492C0F5CCEc5a264d692aA7A8e16` (implementation `0x92D12f0a60906b39d81acD9bf8977b6c824cD98C`).

The runtime bytecode of all four contracts matches this repository's build, with immutables masked (`pnpm verify bytecode`).

**Historical v1** ([`deployments/testnet-v1.json`](deployments/testnet-v1.json)) stays live and is kept only as history. It is affected by F-01 (a relayer could change a MUSD redemption into a share payout by starving gas), which v2 fixes. Its contract source is not reproducible from this repository's git history (disclosure D-01). Do not use v1.

## Redemption and recovery

A MUSD redemption cannot pay less than the minimum you chose, and a relayer cannot force a different outcome. If the payout cannot be met, for example because the share price moved or the native vault is temporarily unavailable, the redemption is **parked as a pending settlement** instead of being paid in another asset. From there:

| Action | Who can call it | Effect |
|---|---|---|
| `retrySettlement(id)` | Anyone | Retries at your original minimum. Never changes your terms |
| `settleWithMinAssets(id, min)` | The recipient only | Settle in MUSD with a new minimum you choose |
| `claimSharesInstead(id)` | The recipient only | Take the wSMUSD shares instead, then exit in kind with `redeemInKind` if the vault is still down |

Settlement uses a gas guard. A delivery or retry sent with too little gas for the payout reverts and changes nothing, so a relayer cannot turn an under-gassed call into a different result (findings F-01 and F-02). Tests cover a 10-year delay, 50 failed retries, an absent relayer and a native vault outage. None of these recovery paths need our backend. The transfer tracker (`/app/transfers/<id>`) shows a pending settlement and offers these actions. A recipient that is a contract unable to make these calls relies on `retrySettlement` alone; if the vault never recovers, its shares stay parked (F-04, disclosed).

## Developer quickstart

Requirements: Node ≥ 20, pnpm 11, and Foundry ≥ 1.8 (the vendored Mezo vault source compiles with solc 0.8.33). Contract dependencies (forge-std, OpenZeppelin) are vendored in `packages/contracts/lib`.

```bash
pnpm install --frozen-lockfile
pnpm --filter @musd-reach/web dev    # http://localhost:3000, reads the v2 deployment from public RPCs
pnpm --filter @musd-reach/api dev    # http://localhost:8787, indexer + relayer; embedded PGlite if DATABASE_URL is unset
```

No keys are needed to browse, read balances or verify. Copy [`apps/web/.env.example`](apps/web/.env.example) to `apps/web/.env.local` for local web configuration. The root [`.env.example`](.env.example) covers all services. The optional API relayer uses `RELAYER_KEY_FILE`; leave it unset for read-only indexing. Wallet connections and the transaction submission path are enabled in the current release; the unresolved MetaMask notice and limits of real-wallet verification are described below. Browsing requires no connection.

### Repository

| Path | Contents |
|---|---|
| [`packages/contracts`](packages/contracts) | Foundry: wrapper, gateways, receipt, NAV oracle; unit, fuzz, invariant and fork tests; deploy script |
| [`packages/sdk`](packages/sdk) | TypeScript reads, message codec, VAA parsing, reconciliation, gas policy |
| [`packages/verifier`](packages/verifier) | `reach-verify`: independent, read-only verification CLI |
| [`packages/protocol-registry`](packages/protocol-registry) | Pinned, verified chain facts |
| [`scripts`](scripts) | Lifecycle executor (fork rehearsal or public testnet) that writes evidence |
| [`apps/api`](apps/api) | Indexer (finality- and reorg-aware), permissionless relayer, read API |
| [`apps/web`](apps/web) | Next.js app: portfolio, wrap, make portable, redeem, tracker, history, proof, status, integrations |
| [`docs`](docs) | Protocol verification, economic model, threat model, findings, testing, deployment, status, loan audit |
| [`evidence`](evidence) | Recorded runs: `real-chain/` is public evidence, `fork-rehearsal/` never is |

Pre-build planning documents are kept in [`docs/planning`](docs/planning); the documents above supersede them.

## Verification commands

The verifier is read-only and uses public RPCs. It needs no key and does not use our API.

```bash
pnpm verify registry      # pinned chain facts (chain ids, vault implementation, Wormhole Cores)
pnpm verify deployment    # wiring: peers, bindings, sole minter, consistency level
pnpm verify bytecode      # deployed runtime code == this repository's build
pnpm verify reconcile     # live backing: locked vs supply vs in flight
pnpm verify all evidence/real-chain/testnet-2026-10-21T11-23-33-084Z.json   # every recorded tx, VAA and effect
```

| Evidence | File |
|---|---|
| v2 public round trip (18 steps) | [`evidence/real-chain/testnet-2026-10-21T11-23-33-084Z.json`](evidence/real-chain/testnet-2026-10-21T11-23-33-084Z.json) |
| Verifier transcripts (62/62) | [`verify-…-084Z.txt`](evidence/real-chain/verify-testnet-2026-10-21T11-23-33-084Z.txt), [pre-push rerun](evidence/real-chain/verify-testnet-2026-10-21T11-23-33-084Z-rerun-2026-10-21T13-49Z.txt) |
| v1 public run (historical) | [`evidence/real-chain/testnet-2026-10-20T15-05-14-568Z.json`](evidence/real-chain/testnet-2026-10-20T15-05-14-568Z.json) |
| Fork rehearsals (not public evidence) | [`evidence/fork-rehearsal/`](evidence/fork-rehearsal) |

## Testing

The counts below describe the recorded suites, not a new execution during this documentation update.

```bash
cd packages/contracts
forge test                                                                       # 75 tests: unit, fuzz, invariants, gas griefing, liveness
RUN_FORK=true forge test --match-path "test/fork/ReachLiveFork.t.sol"            # live Mezo vault + real Wormhole Cores (fork)
RUN_FORK_BASE_MAINNET=true forge test --match-contract MorphoCompatibilityForkTest  # real Morpho Blue on a Base mainnet fork
cd ../..
pnpm test          # SDK (13) and API (23)
pnpm typecheck && pnpm lint
pnpm --filter @musd-reach/web build
```

Browser suites are in `apps/web/e2e` and described in [`docs/TESTING.md`](docs/TESTING.md). They cover fork signing flows, transaction intent (exact approvals, targets and chain ids), wallet rejection, the CSP, responsive layout, accessibility and keyboard use.

## Security model and disclosures

| You trust | For | Notes |
|---|---|---|
| Wormhole guardians | Authenticity of every message | **Testnet uses a single guardian key.** A guardian compromise could mint unbacked rwSMUSD or release locked shares |
| Mezo `MUSDSavingsRate` and its owner | Principal custody | Losses are socialised pro rata to wSMUSD holders; in-kind exit still works |
| Chain finality | Messages are not reorged after signing | Mezo consistency level 202; REDEEM waits for Base finality |
| Guardian role (currently the deployer EOA `0x0F57…Efe6`) | Pausing **new** deposits and locks | Cannot pause exits, release, seize or mint. A single EOA on testnet |

Protocol authentication and exits do not depend on relayers, the Reach API, indexer or website. Users must still verify the chain, target, amount and recipient before signing: a compromised interface could propose a harmful transaction. The deployer cannot arbitrarily mint or release custody after the one-time `bindSourceGateway`; the pause role is described above. Balances and backing are read from chain.

Further reading:

- [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md): 33-row attack matrix, each row mapped to a test, plus the Slither triage.
- [`docs/SECURITY_FINDINGS.md`](docs/SECURITY_FINDINGS.md): contract findings, disclosures and current investigations. F-33 (MetaMask classification) remains open and prevents claiming MetaMask clearance; F-34 records dependency remediation. F-04 (Low) and F-05 (Info) remain disclosed.

There has been no external professional audit.

### Wallet functionality

The global wallet hold has been removed: source code enables connections and the simulate/sign/submit path. The chooser identifies EIP-6963 wallets separately and resolves named legacy wallets to their own providers. Refresh restores only the selected wallet; removing it does not silently connect another extension. This is availability of the code path, **not verification of successful signing in a real extension**.

| Wallet path | Implemented | Verification boundary |
|---|---|---|
| Rabby, MetaMask and Coinbase Wallet | Named injected-provider discovery, explicit legacy-provider selection, and vendor install links when absent; other announced EIP-6963 wallets can also appear | Keyless EIP-6963 and legacy fixtures cover Rabby, MetaMask and Coinbase selection, rejection, switching and reconnection. Historical real MetaMask 13.53.0 connection/network tests predate this chooser. Real Rabby/Coinbase sessions and real-extension transaction signing are unverified |
| WalletConnect | Offered only with an explicitly configured `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`; no shared fallback ID. The app provides its own QR, copy-link and mobile-link view under the strict CSP | Omitted when unconfigured. Authenticated pairing, mobile deep links and transaction signing remain unverified; configure an origin-authorized Reown project and test a compatible wallet before advertising this path |

A malicious-site warning was reported during MetaMask connection. [Provider review #305589](https://github.com/MetaMask/eth-phishing-detect/issues/305589) remains unresolved; the chooser carries a MetaMask-specific advisory. Re-enabling other wallet paths does not establish the cause of the warning or provider clearance. Do not bypass a wallet warning. See the [security status page](https://musd-reach.vercel.app/security).

## Deployment

- **Contracts:** v2 is deployed on Mezo testnet and Base Sepolia.
- **Web app and API:** hosted on Vercel ([web app](https://musd-reach.vercel.app)) and Render ([API health](https://musd-reach-api.onrender.com/health)) since 23 October 2026. The free API may take about a minute to wake. [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) has the runbook and the post-deploy checks.
- **Testnet loan:** the deployment was funded with a Mezo testnet loan that is still open. It is documented in [`docs/LOAN_AUDIT.md`](docs/LOAN_AUDIT.md) and is not protocol funds.

## What we learned

- **Economic correctness starts with the underlying asset.** Address-indexed yield required a wrapper and explicit accounting; an ERC-20 interface alone did not describe the economics.
- **Cross-chain success has several stages.** A mined burn or consumed message does not prove MUSD was paid. Pending settlement needs its own state, minimum and recovery actions.
- **Evidence should be independently reproducible.** A separate read-only verifier and recorded VAAs make backing and authenticated execution checkable without trusting the API or screenshots.
- **Clarity is part of transaction safety.** Exact approvals, target networks, gas requirements and unknown read states matter as much as a polished success screen.
- **Wallet availability and provider clearance are separate facts.** Named-provider discovery avoids forcing one extension, while fixture tests and historical connections still cannot establish live signing or resolve a provider warning.

## What's next

Planned work, not completed functionality:

- Add destination networks only after verifying their Wormhole support, finality, deployment wiring and backing reconciliation.
- Build a real receiving-application integration. Explore lending/collateral use after oracle, risk, liquidity and liquidation review; current Morpho evidence is fork-only.
- Test actual Rabby, Coinbase Wallet and WalletConnect sessions and real-extension signing; pursue resolution of the MetaMask classification.
- Improve SDK packaging, integration examples and reproducible deployment/verification tooling for external developers.
- Add cross-chain delivery/settlement observability, relayer alerts and durable production hosting.
- Obtain independent economic and security review, address remaining findings/dependency advisories, and plan production governance, operations and incident response before any mainnet release.

## Mezo Buildathon

Built for the [Mezo Buildathon](https://mezo.org/blog/mezo-buildathon-is-underway).

Reach addresses the Buildathon's DeFi theme by making a native MUSD savings claim transferable across chains. MUSD is the underlying asset: it enters the Mezo savings vault through the wrapper, backs locked wSMUSD shares and can be recovered after burning the remote receipt. The deployed scope is Mezo testnet and Base Sepolia; the public round-trip evidence demonstrates this integration.

| Project profile | Details |
|---|---|
| Name | MUSD Reach |
| Tagline | Save on Mezo. Reach further. |
| Short description | Keep a savings position on Mezo while holding or transferring a backed receipt on Base Sepolia, then burn it to redeem |
| Infrastructure | Mezo native MUSD savings, ERC-4626 wrapper, Wormhole messaging, Base Sepolia receipt, SDK and independent verifier |
| Product category | Cross-chain savings infrastructure |
| Track relevance | DeFi: portability of MUSD savings-backed capital; receiving applications and public lending integrations remain planned |
| Networks | Mezo testnet (31611) and Base Sepolia (84532) |
| Links | [Live website](https://musd-reach.vercel.app/), [public repository](https://github.com/TheWeirdDee/musd-reach), [public proof](https://musd-reach.vercel.app/proof) |
| Demonstration | Public-testnet wrap, lock, issue, second-holder transfer, burn, share/MUSD return and pending-settlement recovery; recorded evidence above |

The [published Buildathon requirements](https://app.akindo.io/wave-hacks/OVOO0gdrVU8379D10/) call for MUSD and/or MEZO integration, a working deployment, and work developed during the event or a new extension to an existing product. Mezo testnet is accepted. Required submission materials include a live project link, public GitHub repository, project/product deck and a two-minute pitch video, plus the project, audience, stack, track, readiness, milestones and team details requested by the event form. The links and evidence here document the implementation; they do not establish that all submission materials have been prepared or submitted.

## License

[MIT](LICENSE). Vendored libraries in `packages/contracts/lib` and the vendored Mezo vault source keep their own licenses.
