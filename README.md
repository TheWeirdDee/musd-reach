# MUSD Reach

**Your Mezo savings. Beyond Mezo.** Reach keeps MUSD principal inside Mezo's native savings vault and gives you a backed, transferable claim on it on Base. Both directions are authenticated by Wormhole guardian-signed messages, and the claim is redeemable by burning it.

> **Status:** experimental testnet software, **not audited**. The **v1** contracts are deployed on Mezo testnet and Base Sepolia, and one canonical round trip was verified publicly ([`/proof`](apps/web), `evidence/real-chain/`). **v1 has a known Medium issue (F-01)**, fixed in **v2**; v2 is tested locally and on forks but **not deployed**. See [`docs/STATUS.md`](docs/STATUS.md), [`docs/SECURITY_FINDINGS.md`](docs/SECURITY_FINDINGS.md) and [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## How it works

```
MUSD ─deposit→ Mezo MUSDSavingsRate (sMUSD) ─owned by→ ReachSavingsWrapper (wSMUSD)
wSMUSD ─lock→ ReachSourceGateway ─ISSUE VAA→ ReachDestinationGateway ─mint→ rwSMUSD (Base)
rwSMUSD ─burn→ ReachDestinationGateway ─REDEEM VAA→ ReachSourceGateway ─release→ wSMUSD or MUSD
```

- **wSMUSD** is a pro-rata share of the wrapper's net assets: native principal plus claimed and pending native yield. The wrapper harvests before every price, so depositors cannot capture each other's yield. There are no fees and no admin mint.
- **rwSMUSD** is a claim on exactly one locked wSMUSD unit. It is not pegged and carries no promised APY.
- **Invariant:** `locked wSMUSD = rwSMUSD supply + in-flight issues + in-flight redemptions`, checkable by anyone with `pnpm verify reconcile`.

## Repository

| Path | What |
|---|---|
| `packages/contracts` | Foundry: wrapper, gateways, receipt, NAV oracle harness; unit, fuzz, invariant and fork tests; deploy script |
| `packages/sdk` | TypeScript reads, message codec, VAA parsing, reconciliation |
| `packages/verifier` | `reach-verify`: independent, read-only verification CLI |
| `packages/protocol-registry` | Pinned, verified chain facts |
| `scripts/lifecycle.ts` | Canonical-run executor (fork rehearsal or public testnet) that writes evidence |
| `apps/api` | Indexer (finality- and reorg-aware), permissionless relayer, read API |
| `apps/web` | Next.js app: landing, portfolio, wrap, make portable, redeem, tracker, history, proof, status |
| `docs/` | Protocol verification, economic model, threat model, deployment, status |
| `evidence/` | Recorded runs. `fork-rehearsal/` is never public evidence; `real-chain/` holds public runs |

## Quickstart

```bash
pnpm install
cd packages/contracts && forge test                     # 72 tests: unit, fuzz, invariants, gas griefing
RUN_FORK=true forge test --match-path "test/fork/*"     # live Mezo vault + real Wormhole cores (fork)
cd ../.. && pnpm verify registry                        # live chain facts vs registry
pnpm --filter @musd-reach/web dev                       # http://localhost:3000
pnpm --filter @musd-reach/api dev                       # http://localhost:8787 (PGlite if no DATABASE_URL)
```

Foundry ≥ 1.8 is required, because the vendored Mezo vault source compiles with solc 0.8.33.

## Deploying

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md). It needs a funded deployer key on Mezo testnet and Base Sepolia, and explicit authorization.

## Security

See [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md). You trust the Wormhole guardians (a single key on testnet) and Mezo's vault owner. You do not trust relayers, our backend, or the deployer after the one-time bind.
