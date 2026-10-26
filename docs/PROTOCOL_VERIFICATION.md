# Protocol verification

Re-checked **20 October 2026** with read-only RPC calls from this repository's tooling (`cast`, viem, `reach-verify`). Nothing was signed or sent. These are observations at the stated blocks, not permanent guarantees; `pnpm verify registry` re-checks them at any time and fails closed on drift.

## Mezo testnet

| Fact | Value | Method |
|---|---|---|
| EVM chain id | 31611 (`0x7b7b`) | `eth_chainId` on `https://rpc.test.mezo.org` |
| Head at check | 16 261 391 → 16 262 144 during the session | `eth_blockNumber` |
| Finality | `finalized` tag == latest (CometBFT instant finality) | `eth_getBlockByNumber("finalized")` |
| Savings vault proxy (sMUSD) | `0x6f461c68B2c5492C0F5CCEc5a264d692aA7A8e16` | — |
| Implementation | `0x92D12f0a60906b39d81acD9bf8977b6c824cD98C` (unchanged vs. report) | EIP-1967 slot `0x3608…2bbc` |
| Proxy admin | `0x71e5e16E17D2ede8395439c8d5bc2c98654bA157` | EIP-1967 admin slot |
| Vault owner | `0x6e80164ea60673D64d5d6228beb684a1274Bb017` | `owner()` |
| Strategy | `0x6abE6853f3006f304709084AC37f826Be50847E0` (IdleStrategy semantics) | `strategy()` |
| `musdToken()` | `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503` — "Mezo USD", MUSD, 18 dp | `eth_call` |
| `pcv()` / `vaultGauge()` | both zero address | `eth_call` |
| `yieldIndex` | 162 967 341 081 415 580 150 (non-zero: yield has been distributed historically) | `eth_call` |
| `totalSupply` | ≈ 886 040 sMUSD | `eth_call` |
| Wormhole Core | `0x268557122Ffd64c85750d630b716471118F323c8`: chainId 50, evmChainId 31611, messageFee 0, guardian set 0 = [`0x13947Bd48b18E53fdAeEe77F3473391aC727C638`] | `eth_call` |

### Verified source

The implementation's verified source was fetched from the Mezo Blockscout API (`/api/v2/smart-contracts/0x92D1…D98C`): `MUSDSavingsRate`, solc 0.8.33, optimizer 100 runs, EVM `london`. It is vendored unmodified under `packages/contracts/test/vendor/mezo-savings/` and compiled with its original compiler in tests.

Semantics confirmed from source and reproduced on a fork of the live vault (`test/fork/ReachLiveFork.t.sol`):

- `deposit(a)` mints exactly `a` sMUSD; `withdraw(a)` burns `a` and returns `a` MUSD **and claims the caller's yield**.
- Yield is account-indexed: `claimable(x) = claimableYield[x] + balanceOf(x) × (yieldIndex − supplyYieldIndex[x]) / 1e18`.
- Every transfer checkpoints both parties first, so **accrued yield stays with the sender**.
- `receiveProtocolYield(amount)` and `receiveYieldFromStrategy()` are permissionless. Yield distributed while supply is zero is buffered.
- Not ERC-4626. The owner can `setStrategy`, which migrates **all principal** to a new strategy. This is a trust assumption Reach inherits.
- ERC-2771 forwarder is set at construction; not exposed by a getter in this build.

**Decision:** build the accumulating claim-and-hold wrapper described in PRD v2, harvest before every price, and pin the implementation address in deploy scripts and the verifier.

**Open:** sponsor confirmation that this testnet vault is the supported developer endpoint has **not** been obtained.

## Base Sepolia

| Fact | Value |
|---|---|
| EVM chain id | 84532 |
| Wormhole Core | `0x79A1027a6A159502049F10906D333EC57E95F083`: chainId 10004, evmChainId 84532, messageFee 0, guardian set 0 = same single guardian |

## Wormhole transport observations

- Wormholescan testnet API (`https://api.testnet.wormholescan.io/api/v1/vaas/50…`) indexes Mezo VAAs, so Reach can self-relay without a Wormhole relayer.
- Canonical MUSD NTT transceivers on both chains publish with **consistency level 202**; signed VAAs exist for them. Reach uses 202.
- The canonical NTT bridge is a separate protocol and has **no** authority over rwSMUSD. Reach deploys its own emitters; nothing from NTT is reused as Reach evidence.
- Testnet guardian set 0 has **one** key. Mainnet uses 19 guardians with a 13-of-19 quorum.

## Morpho (Base mainnet; local fork tests only)

| Fact | Value |
|---|---|
| Morpho Blue | `0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb` (code present) |
| Adaptive Curve IRM | `0x46415998764C29aB2a25CbeA6254146D50D22687`: `isIrmEnabled` = true |
| LLTV 38.5% / 77% | `isLltvEnabled` = true / true |
| USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`, 6 dp |
| Wormhole Core (Base) | `0xbebdb6C8ddC678FfA9f8748f85C815C556Dd8ac6`: chainId 30, evmChainId 8453, fee 0 |

No official Base Sepolia Morpho deployment was used. Compatibility was exercised only on a **local fork of Base mainnet** (`test/fork/MorphoCompatibilityFork.t.sol`). No Reach market, lender, curator or borrower exists.

## Hackathon

Built for the Mezo hackathon.
