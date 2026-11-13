# Built on Mezo

MUSD Reach exists to put Mezo savings to work. The asset is MUSD, the yield is Mezo's Savings Vault, the borrowed stablecoin can be MUSD itself, and MUSD moves between chains on Mezo's own bridge. Every loan made on Base starts as MUSD deposited in Mezo's Savings Vault.

## Every Mezo contract Reach uses

Testnet addresses come from [`packages/protocol-registry/registry.json`](../packages/protocol-registry/registry.json). Reach is deployed on Mezo testnet and Base Sepolia. Mainnet addresses were read from Mezo mainnet (chain 31612) on 11 November 2026, and the [mainnet fork test](../packages/contracts/test/fork/ReachMezoMainnetFork.t.sol) runs Reach against them on a local copy of mainnet state, so the contracts are ready for a mainnet launch after audit.

| Mezo contract | What Reach calls | Why | Mezo testnet (31611) | Mezo mainnet (31612) |
|---|---|---|---|---|
| **MUSD** | `transferFrom`, `transfer`, `approve`, `balanceOf` | The savings asset. Deposits enter as MUSD and exits can leave as MUSD. Exact approvals only. | `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503` | `0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186` |
| **MUSD Savings Vault** (`MUSDSavingsRate`, sMUSD) | `deposit`, `withdraw`, `claimYield`, `receiveYieldFromStrategy`, `yieldIndex`, `supplyYieldIndex`, `claimableYield`, `balanceOf`, `transferFrom`, `pcv`, `musdToken` | Holds every saved MUSD behind wSMUSD and rwSMUSD. The wrapper harvests its yield before every deposit and exit, so the share price always includes yield owed. | proxy `0x6f461c68B2c5492C0F5CCEc5a264d692aA7A8e16` | proxy `0xb4D498029af77680cD1eF828b967f010d06C51CC` (implementation `0xB33C3f97BF3B7df59417D114c694353E42929e87`) |
| **sMUSD VaultGauge** (MEZO emissions), used by `ReachSavingsWrapperV3` only | `deposit`, `withdraw`, `getReward`, `earned`, `balanceOf`, `stakingToken`, `rewardToken` | Gauge mode: when MEZO emissions pay more than the savings rate, the guardian stakes the wrapper's sMUSD here. The gauge sends staked sMUSD's MUSD yield to veBTC voters, so this is a choice of yield, not extra yield. Exits unstake exactly what they need. Tested against the live gauge on a local mainnet fork. | none on testnet | `0x677817bF3e44b90E8F95222F75e2950b7904a401` |
| **MUSD PCV** | `distributeMUSD` (best effort, gas-guarded) | Pulls protocol fees into the Savings Vault before pricing, so a new depositor can never buy yield that belongs to existing savers. | not set on testnet | read from `pcv()` |
| **Mezo Wormhole Core** | `publishMessage`, `parseAndVerifyVM`, `messageFee` | Carries ISSUE and NAV messages from Mezo and verifies REDEEM messages arriving from Base, at Mezo's finalized consistency level (202). | `0x268557122Ffd64c85750d630b716471118F323c8` | n/a (testnet deployment) |
| **Mezo's canonical MUSD bridge** (Wormhole NTT): NttManager and WormholeTransceiver | `transfer` (with relaying skipped), `receiveMessage` | Moves MUSD between Mezo and Base: testers take MUSD to Base to lend it, and borrowers bring borrowed MUSD home to save it again. | manager `0x20888B20e2F5F405d44261dA96467a1b1acE15be`, transceiver `0x0E628A1C34c92F0aA85aF998814Ce4f03cAA5913` | n/a |
| **MUSD on Base** (minted only by Mezo's bridge) | `approve`, `transfer`, `balanceOf` | The loan asset of the MUSD market and the Reach MUSD Vault: borrow Mezo's own stablecoin against Mezo savings. | Base Sepolia `0x560985f804De8187E8FBA94F7127Bc4c0e54AEA5`, manager `0x6590DFF6abEd7C077839E8227A4f12Ec90E6D85F`, transceiver `0x2ada2d985Ce69b467d2D8372494Df021BEDfdbf2` | n/a |

Testers are also sent to two Mezo apps: the [Mezo testnet faucet](https://faucet.test.mezo.org) for BTC gas, and [testnet.mezo.org/borrow](https://testnet.mezo.org/borrow) to mint MUSD against BTC when the Reach starter kit is empty for the day.

## Mezo rules Reach is built around

- **Savings principal is 1:1 and yield is per address.** sMUSD does not appreciate; yield accrues to the address that holds it. Moving sMUSD itself would split principal from yield, so `ReachSavingsWrapper` owns the sMUSD and prices one ERC-4626 share as principal plus claimed and pending yield.
- **Yield arrives from the PCV and the vault's strategy.** Every wrapper deposit and exit first runs the PCV distribution and `receiveYieldFromStrategy`, then claims, so pricing never misses yield already owed.
- **Mainnet stores `claimableYield`; testnet computes it.** The mainnet implementation only updates an account's claimable yield when the account is touched. The wrapper therefore prices pending yield from `yieldIndex - supplyYieldIndex`, which is correct on both versions. The mainnet fork test checks this against live state.
- **Finality before messages.** Reach publishes on Mezo at consistency level 202, so guardians sign only finalized Mezo blocks.
- **Mezo's calldata gas floor.** Mezo enforces the EIP-7623 calldata floor that some RPC estimates miss, so the app and scripts send explicit gas limits on Mezo.
- **BTC is gas on Mezo.** Every Mezo step needs a little test BTC; the guide links Mezo's own faucet first.

## How Reach grows Mezo

1. A saver deposits MUSD into Mezo's Savings Vault through Reach and receives rwSMUSD on Base.
2. rwSMUSD is collateral in two Morpho Blue markets on Base: borrow **MUSD** or USDC.
3. Borrowed MUSD goes home over Mezo's bridge and can be saved again, adding to the vault.

Every step adds MUSD demand or MUSD savings on Mezo. About 7% of MUSD is saved today (1.33M of 19.0M on Mezo mainnet, read on chain 12 November 2026), down from 7.4M before one Mezo contract withdrew 5.25M on 5 November. Mezo shares a pool of MUSD fees among savers, so the savings rate is now above the cost of borrowing on Base, and saving then borrowing against it beats withdrawing ([business model](BUSINESS_MODEL.md)).

## Proof

- MUSD market loop on public testnets, including the bridge home and the deposit back into savings: [`evidence/markets/`](../evidence/markets).
- Mezo's bridge, both directions, driven by [`scripts/bridge-musd.ts`](../scripts/bridge-musd.ts) and the in-app [Bridge MUSD](https://musd-reach.vercel.app/app/bridge) page.
- Mezo mainnet fork: `RUN_FORK_MEZO_MAINNET=true forge test --match-contract ReachMezoMainnetForkTest` (from `packages/contracts`).
- Mezo testnet fork against the live vault and real Wormhole Cores: `RUN_FORK=true forge test --match-path test/fork/ReachLiveFork.t.sol`.
