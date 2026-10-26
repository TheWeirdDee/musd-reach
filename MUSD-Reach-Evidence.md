# MUSD Reach — Public Testnet Evidence & Verification Manifest

**Project:** MUSD Reach  
**Competition:** Mezo Buildathon 2026  
**Live Application:** [https://musd-reach.vercel.app/](https://musd-reach.vercel.app/)  
**Contract Registry:** [https://musd-reach.vercel.app/contracts](https://musd-reach.vercel.app/contracts)  
**Proof Dashboard:** [https://musd-reach.vercel.app/proof](https://musd-reach.vercel.app/proof)  
**API Health:** [https://musd-reach-api.onrender.com/health](https://musd-reach-api.onrender.com/health)  
**Repository:** [https://github.com/TheWeirdDee/musd-reach](https://github.com/TheWeirdDee/musd-reach)  

---

## 1. Network & Contract Registry

### Mezo Testnet (Chain ID: 31611)
- **Explorer:** [https://explorer.test.mezo.org/](https://explorer.test.mezo.org/)
- **MUSD Stablecoin:** `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503`
- **Native Savings Vault Proxy:** `0x6f461c68B2c5492C0F5CCEc5a264d692aA7A8e16`
- **Native Savings Vault Implementation:** `0x92D12f0a60906b39d81acD9bf8977b6c824cD98C`
- **ReachSavingsWrapper (`wSMUSD`):** `0xf8cF6fCCC7bcF2860BfAD1Ea4A6018D446eb4306` (Deployed at block `16279234`)
- **ReachSourceGateway:** `0xA5c70F8D6B329ED6c2d15D604B66FafC3A6C96d3` (Deployed at block `16279265`)
- **Mezo Wormhole Core:** `0x268557122Ffd64c85750d630b716471118F323c8` (Wormhole Chain ID: `50`)

### Base Sepolia (Chain ID: 84532)
- **Explorer:** [https://sepolia.basescan.org/](https://sepolia.basescan.org/)
- **ReachDestinationGateway:** `0x50436eB8F8213c7df773F2c331Bb41e1fecb5a23` (Deployed at block `48406337`)
- **RemoteWrapperReceipt (`rwSMUSD`):** `0x02777A938e69f848d4413b9033D225f0D1444e89`
- **Base Wormhole Core:** `0x79A1027a6A159502049F10906D333EC57E95F083` (Wormhole Chain ID: `10004`)

---

## 2. Public-Testnet Verified Execution Log (Run: `testnet-2026-10-21T11-23-33-084Z`)

All transactions below were executed on live public testnets (Mezo Testnet and Base Sepolia) with Wormhole testnet guardian signatures, verified independently by `pnpm reach-verify all` (62 checks passed, 0 failed).

### Test Wallets
- **Primary Wallet:** `0x0F579957D94D1D12Fbb0dE3A495180629098Efe6`
- **Secondary Wallet:** `0x3a71111bb6578Beb61E39af9C09223c02b41D701`

---

### Step-by-Step Transaction Manifest

| Step | Operation | Chain | Block | Transaction Hash / Identifier | Explorer / Verification Link |
|---|---|---|---|---|---|
| **01** | Bounded MUSD Allowance Approval to Source Gateway (6.0 MUSD) | Mezo (31611) | 16279427 | `0x7d80835117a02bca97f17dc68a69a2c09ce99adb129ff32ca98e21827e174d80` | [Mezo Explorer Tx](https://explorer.test.mezo.org/tx/0x7d80835117a02bca97f17dc68a69a2c09ce99adb129ff32ca98e21827e174d80) |
| **02** | Deposit MUSD → Native Savings Vault → Mint wSMUSD → Lock in Source Gateway → Publish Wormhole ISSUE message | Mezo (31611) | 16279430 | `0x1fdfc665716297805f5af60961df8808ddfbe9466a8d8b6d2ea10809266099d7` | [Mezo Explorer Tx](https://explorer.test.mezo.org/tx/0x1fdfc665716297805f5af60961df8808ddfbe9466a8d8b6d2ea10809266099d7) |
| **02-ID** | Unique Transfer ID Generated | Off-chain / Protocol | — | `0x9fbde66ef230e7f12a6a4a3f86accf95ec3aca19e974b68f0ac9ae11246fc404` | Sequence `0`, Consistency Level `202` |
| **03** | Wormhole Guardian-Signed ISSUE VAA | Off-chain | — | Digest: `0x8e4a6b6dcdb84e818496122d5d3de3df1e007f56a107ff3e4bcd6bc807657750` | Signed by Wormhole Guardians (Emitter: `0xA5c70F...`) |
| **04** | Byte-Altered ISSUE VAA Rejected (Negative Security Test) | Base Sepolia | — | Simulation Rejection: `InvalidVaa` | Live contract rejects corrupted signatures |
| **05** | Destination Gateway Verifies VAA, Consumes Transfer ID, Mints 6 rwSMUSD | Base Sepolia (84532) | 48406788 | `0x77f19efa4666a4f0e1f2962ed62c4fbb3f398c16116351d10e83792053a81455` | [BaseScan Tx](https://sepolia.basescan.org/tx/0x77f19efa4666a4f0e1f2962ed62c4fbb3f398c16116351d10e83792053a81455) |
| **06** | Replayed ISSUE VAA Rejected (Negative Security Test) | Base Sepolia | — | On-chain Revert: `AlreadyConsumed` | Double-spend protection verified |
| **07** | ERC-20 Receipt Transfer: 3 rwSMUSD to Secondary Wallet | Base Sepolia (84532) | 48406796 | `0x52c1cdaa9ace5d1b73fdfd5d0b01f1035b52b019525d925c1b8bcb0fda2f7760` | [BaseScan Tx](https://sepolia.basescan.org/tx/0x52c1cdaa9ace5d1b73fdfd5d0b01f1035b52b019525d925c1b8bcb0fda2f7760) |
| **08a** | Burn rwSMUSD in Shares Mode (Secondary Wallet) & Publish REDEEM | Base Sepolia (84532) | 48406802 | `0x5e6bc5d38a293abc07fafd92e6f723f08668bb3aee4ece21b8166b3aed2b5337` | [BaseScan Tx](https://sepolia.basescan.org/tx/0x5e6bc5d38a293abc07fafd92e6f723f08668bb3aee4ece21b8166b3aed2b5337) |
| **08b** | Burn rwSMUSD in MUSD Mode (Primary Wallet) & Publish REDEEM | Base Sepolia (84532) | 48406807 | `0x480b9adf783eb270b3d7877633a2b1823a7d6175d936f430983751c6f2808b97` | [BaseScan Tx](https://sepolia.basescan.org/tx/0x480b9adf783eb270b3d7877633a2b1823a7d6175d936f430983751c6f2808b97) |
| **08c** | Burn with Unreachable Minimum Slippage Bound (Recovery Test) | Base Sepolia (84532) | 48406812 | `0xda2d5d75328b4a78f7bde4c0a08ce120fa6fc55e83619b600b0b97755cc7cd6c` | [BaseScan Tx](https://sepolia.basescan.org/tx/0xda2d5d75328b4a78f7bde4c0a08ce120fa6fc55e83619b600b0b97755cc7cd6c) |
| **09** | Wormhole Guardian-Signed REDEEM VAAs Generated | Off-chain | — | Digests: `0xc6ed5c...`, `0x2b839f...`, `0xa964b2...` | Verified across Base finality |
| **11a** | Authenticated Release: Exact wSMUSD to Secondary Wallet | Mezo (31611) | 16279630 | `0xb65a46b289882719fbc9729075dbf1b88098d6c0e4b81eadfab64207ba06af11` | [Mezo Explorer Tx](https://explorer.test.mezo.org/tx/0xb65a46b289882719fbc9729075dbf1b88098d6c0e4b81eadfab64207ba06af11) |
| **11b** | Authenticated Release: MUSD Unwrapped & Paid to Primary Wallet | Mezo (31611) | 16279632 | `0x3fadf55034dfe4a21d5015fa6cfeec92c426e96be401cb6c144677db47e86ae0` | [Mezo Explorer Tx](https://explorer.test.mezo.org/tx/0x3fadf55034dfe4a21d5015fa6cfeec92c426e96be401cb6c144677db47e86ae0) |
| **12a** | Unreachable Minimum Delivery: Parked as Pending Settlement | Mezo (31611) | 16279633 | `0xb89ca393e22a8a13f4c653c3f43902bdf6d26078b5ded52ed21fd34e4c49c29e` | [Mezo Explorer Tx](https://explorer.test.mezo.org/tx/0xb89ca393e22a8a13f4c653c3f43902bdf6d26078b5ded52ed21fd34e4c49c29e) |
| **12d** | Recipient Settlement Recovery: Settled at Acceptable Minimum, MUSD Paid | Mezo (31611) | 16279637 | `0x5165900940b2fc9de436c1802e504f93c768bafaefb0041d3cdc050255562be9` | [Mezo Explorer Tx](https://explorer.test.mezo.org/tx/0x5165900940b2fc9de436c1802e504f93c768bafaefb0041d3cdc050255562be9) |

---

## 3. Mathematical Invariants & On-Chain Reconciliation

The read-only verifier checks the live chain state at block `16280833` (Mezo) and `48410141` (Base):

$$\text{Total Locked wSMUSD} = \text{Remote Supply (rwSMUSD)} + \text{In-Flight Issues} + \text{In-Flight Redemptions}$$
$$\text{Custody wSMUSD} \ge \text{Total Locked} + \text{Pending MUSD Settlements}$$
$$\text{Total Locked} = \text{Total Issued} - \text{Total Released} = 6.0 - 6.0 = 0$$
$$\text{Discrepancy} = 0.000000000000000000 \quad (\text{Status: BALANCED})$$

All 62 independent checks in the verification suite pass without errors.

---

## 4. Verification Categorization & Testing Transparency

To ensure absolute honesty and compliance with buildathon rules:

1. **Public Testnet (Mezo 31611 + Base Sepolia 84532):**
   - Full 18-step cross-chain round trip: deposit, wrap, lock, Wormhole VAA issuance, destination minting, secondary transfer, multi-mode burn, source release, parked settlement, and recipient recovery.
   - Live RPC checks on deployed contracts, runtime bytecode matches, and state reconciliations.
2. **Mainnet Fork Testing (Anvil):**
   - Morpho Blue market acceptance, collateral deposits, and borrowing workflows simulated against pinned mainnet state.
3. **Local Testing:**
   - Foundry fuzzing, invariant tests, negative fault injections, and multi-year time-lock simulations.
4. **Current Limitations Disclosed:**
   - Morpho Blue markets and third-party lending protocol adoptions are planned future integrations and are not deployed on live public networks.
   - MUSD currently stays on Mezo; direct onboarding from Base without prior bridging is future work.
   - The protocol has undergone rigorous automated formal testing and verifier auditing, but has not yet completed a commercial third-party audit firm engagement.
