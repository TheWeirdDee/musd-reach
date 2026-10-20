# MUSD Reach — protocol and product verification

Checked 20 October 2026. Read-only investigation; no deployments, signed transactions, token transfers, repository changes, or outreach were performed. The supplied PRD remains unchanged.

## Decision

The idea has an identifiable user job: obtain liquidity or use a Mezo savings-backed position in a destination-chain application without first unwinding the savings position. This is a plausible product hypothesis, not evidence of demand from Mezo savers.

A concrete receiving protocol is Morpho Blue on Base. Its permissionless market system can technically support a new collateral asset, subject to its documented interfaces and market parameters. No rsMUSD market, liquidity commitment, partnership, or adopter was established in this investigation.

Two important dependencies are now substantially clearer:

- A deployed sMUSD vault exists on both Mezo mainnet and testnet, and the implementations were checked against live bytecode.
- Existing authenticated MUSD messages between Mezo testnet and Base Sepolia validate on the destination Core contracts; altered payloads fail verification, and previously consumed messages fail replay attempts.

However, the PRD's fundamental savings accounting description contradicts the deployed vault implementation. Fix that design before implementing Reach's own receipt lifecycle.

## 1. Buildathon announcement recovered

The exact announcement was successfully retrieved directly from:

https://mezo.org/blog/mezo-buildathon-is-underway/

Its HTML title is “Mezo Buildathon: Build with MUSD & MEZO | $7,000 in Prizes”; the article heading matches the user's supplied text. The earlier retrieval failure was a limitation of that retrieval route, not evidence the article was absent.

The announcement says: Wave 1 ends October 26, Wave 2 runs November 2–15, and winners/demo session is November 23. It accepts working MUSD and/or MEZO integrations on Mezo, Ethereum, Base or BSC, including Mezo testnet submissions. It does not say that every native Mezo product is deployed on testnet, nor does it specify the deadline's exact timezone in the retrieved text.

## 2. Real vault deployments

| Field | Mezo mainnet | Mezo testnet |
|---|---|---|
| EVM chain ID | 31612 | 31611 |
| Vault/sMUSD proxy | `0xb4D498029af77680cD1eF828b967f010d06C51CC` | `0x6f461c68B2c5492C0F5CCEc5a264d692aA7A8e16` |
| Implementation at checked block | `0xB33C3f97BF3B7df59417D114c694353E42929e87` | `0x92D12f0a60906b39d81acD9bf8977b6c824cD98C` |
| Underlying returned by `musdToken()` | `0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186` | `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503` |
| Token name / symbol | MUSD Savings Rate / sMUSD | MUSD Savings Rate / sMUSD |
| Decimals | 18 | 18 |
| `pcv()` at checkpoint | `0x391EcC7ffEFc48cff41D0F2Bb36e38b82180B993` | Zero address |
| Pinned block | 12637951 | 16260405 |
| Block hash | `0xd78260ff1022b281d715ca211c39bdf4ab93d9dd44ff2311696cbec37b05e4a3` | `0xaa679ab3649e02abd4f86400ab1541e3a0c8bbb67d0a3ae73d452daecff73b2f` |
| Implementation bytecode vs explorer | Exact match | Exact match |

Checks used `eth_chainId`, `eth_getBlockByNumber`, `eth_getCode`, the EIP-1967 implementation storage slot, and `eth_call` on the proxy. Mainnet RPC: https://jsonrpc-mezo.boar.network/ ; testnet RPC: https://rpc.test.mezo.org . The plain mainnet endpoint `https://rpc.mezo.org` failed from this environment; the alternate returned chain ID 31612.

The mainnet PCV address also agrees with Mezo’s published MUSD deployment. On testnet, `pcv()` and `vaultGauge()` are both zero at the checkpoint: native protocol-fee distribution and gauge integration must not be assumed to be configured like mainnet. Existing yield-claim transactions do not prove an ongoing production-like fee stream.

These are real deployed contracts, not local mock vaults. The testnet underlying agrees with Mezo's published test MUSD address. A separately published designation of this savings proxy as the currently recommended developer endpoint was not found in the contracts-reference page; confirm that designation with Mezo before treating a testnet deployment as a supported long-term dependency.

Explorer/source links:

- [Mainnet proxy](https://explorer.mezo.org/address/0xb4D498029af77680cD1eF828b967f010d06C51CC)
- [Mainnet implementation](https://explorer.mezo.org/address/0xB33C3f97BF3B7df59417D114c694353E42929e87?tab=contract)
- [Testnet proxy](https://explorer.test.mezo.org/address/0x6f461c68B2c5492C0F5CCEc5a264d692aA7A8e16)
- [Testnet implementation](https://explorer.test.mezo.org/address/0x92D12f0a60906b39d81acD9bf8977b6c824cD98C?tab=contract)
- [Published token registry](https://mezo.org/docs/users/resources/contracts-reference)

### Existing native testnet actions verified via RPC receipts

All three receipts below returned status `0x1`, targeting the testnet vault proxy. These were existing transactions, not transactions submitted during this investigation.

| Action | Transaction | Block |
|---|---|---|
| Deposit | `0xc07eec340a241ffbc80fe1fcabe14ac2b635d9c667f1325f720a6a9c2ff49019` | 16231599 |
| Withdrawal | `0x9d6b2dba41bdcadce210d69d811d3f8455006061b0dff65bb1f471bfb07ea562` | 16197590 |
| Yield claim | `0x8b667897f71a1f3fed6b9c73158a2e26c425b127430323b8bdbfc65142fc4474` | 15985116 |

Inspect each at `https://explorer.test.mezo.org/tx/<transaction hash>`.

## 3. Critical correction: sMUSD does not work as the PRD assumes

The public savings documentation describes an increasing share-to-MUSD exchange rate. The deployed `MUSDSavingsRate` implementation checked here behaves differently:

- `deposit(uint256)` transfers MUSD in, mints the same number of sMUSD units, then allocates principal to a strategy.
- `withdraw(uint256)` realizes the caller's accrued yield, deallocates the requested principal, burns that number of sMUSD units, and returns that principal in MUSD.
- Yield is indexed using `yieldIndex`, `supplyYieldIndex(address)` and `claimableYield(address)`.
- `claimYield()` updates and pays the caller's MUSD entitlement.
- Transfers checkpoint both sender and receiver against their pre-transfer balances. Already accrued yield stays credited to the relevant account; it does not all move automatically with the transferred principal token.
- The ABI does not provide the ERC-4626 asset/share conversion and standard deposit/redeem interface assumed by a generic ERC-4626 integration.

Consequences for Reach:

1. Moving native sMUSD into escrow does not move the saver's previously accrued yield entitlement into that escrow. The saver retains that entitlement at the native vault.
2. Future yield on escrowed principal accrues to the escrow account. A remote ERC-20 holder cannot call the native vault to claim the escrow's yield as their own.
3. A remote receipt representing only a fixed number of native sMUSD units does not automatically represent an appreciating claim that includes all yield.
4. Remote transfers, partial redemptions and delayed messages require explicit rules assigning yield; otherwise holders can lose entitlement or receive another holder's yield.

A practical redesign candidate is a source-side accumulating wrapper: it holds native sMUSD, claims MUSD yield, compounds under explicit rules, and issues its own shares. Reach then exports claims on locked wrapper shares. This changes the invariant to remote receipts backed by wrapper shares, rather than claiming every remote unit always corresponds to exactly one native sMUSD unit. Harvest timing, deposits/redemptions, pending messages, rounding and dilution still need implementation and adversarial tests.

The alternative is a principal receipt plus a separate indexed yield entitlement. That preserves principal denomination but adds cross-chain reward allocation complexity. Neither design was implemented or tested here.

Documentation used for comparison: https://mezo.org/docs/users/mezo-earn/vaults/musd-savings-vault/

## 4. Authenticated transport — live read-only tests

| Component | Mezo testnet | Base Sepolia |
|---|---|---|
| Wormhole chain ID | 50 | 10004 |
| Core | `0x268557122Ffd64c85750d630b716471118F323c8` | `0x79A1027a6A159502049F10906D333EC57E95F083` |
| Existing MUSD NTT manager | `0x20888B20e2F5F405d44261dA96467a1b1acE15be` | `0x6590DFF6abEd7C077839E8227A4f12Ec90E6D85F` |
| Existing MUSD transceiver | `0x0E628A1C34c92F0aA85aF998814Ce4f03cAA5913` | `0x2ada2d985Ce69b467d2D8372494Df021BEDfdbf2` |

Contract addresses were cross-checked against Wormhole's registry/SDK and Mezo's public testnet bridge deployment manifest:

- https://docs.wormhole.com/reference/contract-addresses/
- https://github.com/mezo-org/ntt-bridge-musd-testnet/blob/main/deployment.json
- https://raw.githubusercontent.com/wormhole-foundation/wormhole-sdk-ts/main/core/base/src/constants/contracts/core.ts

Two existing, different transfers were selected. They demonstrate opposite directions, not one wallet's single round trip:

| Direction | Source transaction | Source VAA |
|---|---|---|
| Mezo → Base Sepolia | `0xfc56e25bdddcba0e1d2b43e7c92958d3fa9021d6e814e2dae430a83f7418d805` | emitter `0x0E628A1C34c92F0aA85aF998814Ce4f03cAA5913`, sequence 79 |
| Base Sepolia → Mezo | `0xba297c44f5c6b15e989cd5aeff57242a0ffa3138846bcbfc45aeb80969204857` | emitter `0x2ada2d985Ce69b467d2D8372494Df021BEDfdbf2`, sequence 13 |

Both source receipts returned status `0x1` from their respective RPCs.

For each direction:

1. Retrieved the existing signed VAA from the testnet Wormholescan API.
2. Called the actual destination Core's `parseAndVerifyVM(bytes)` at a pinned block: **valid = true**, empty reason.
3. Flipped one payload byte while retaining the original signature and called again: **valid = false**, reason **VM signature invalid**.
4. Called the existing destination transceiver's `receiveMessage(bytes)` with the already consumed original VAA through `eth_call`: execution reverted with selector `0xb4c3b00c` plus the VAA digest.
5. Independently derived that selector as `TransferAlreadyCompleted(bytes32)` and matched the digest against the verified message.
6. Called `isVAAConsumed(bytes32)` on both transceivers; each returned true.

Destination checkpoints:

- Mezo destination block `0xf81d56` (16260438).
- Base Sepolia destination block `0x2e1ef32` (48361266).

Message digests:

- Mezo → Base: `0x8b0f98f8a1aed35133810a273ba83ffeb855766302948d01729eb9e49b9e3ef1`
- Base → Mezo: `0x3ce5553e93bd4803c845c5348e46d5a856f6b3c6c263d14b6c160e9657b6ea4e`

These were read-only calls; no message was newly delivered by this investigation. Replays were checked against existing consumed state, not against a newly deployed Reach contract. The fetched VAAs use testnet guardian set 0 and one signature; these results must not be represented as mainnet security validation.

The verified transport establishes a credible foundation for application-owned messaging. It does not grant Reach control of canonical MUSD managers or authenticate an arbitrary Reach emitter automatically.

### What is still unproven

The requested exact Reach lifecycle — actual savings lock → new receipt mint → receipt burn → source unlock — has not been executed. The supplied material contains a PRD, not deployed Reach custody, token and messenger addresses or a signing/deployment setup. A real test needs those contracts, configured peers, funded testnet signing, and corrected yield semantics. Existing MUSD bridge success must not be substituted for this test.

Reach-specific tests must additionally cover: trusted-emitter and destination binding, version/action binding, amount and recipient integrity, replay rejection at the application level, no release before authenticated burn, retries, delayed delivery, partial exits and supply/yield conservation. The Core's signature validation alone does not supply application replay protection.

## 5. Concrete receiving application: Morpho Blue on Base

**User job:** A saver wants USDC liquidity on Base while retaining exposure to their Mezo savings-backed position. Reach would deliver a transferable receipt that the saver posts as collateral in a dedicated Morpho market, borrows USDC against, and later retrieves after repaying. This is a proposed workflow, not an existing rsMUSD market or proof it is cheaper or better than alternatives.

Morpho is an existing independent lending protocol; Reach would integrate with it instead of inventing its own lending protocol to manufacture a demonstration.

Published Base Morpho address: `0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb`.

Read-only Base mainnet checks also returned deployed code at the published Morpho address, enabled Adaptive Curve IRM `0x46415998764C29aB2a25CbeA6254146D50D22687`, and an enabled 38.5% LLTV at block `0x3267078`. This is a compatibility check, not a recommendation to use that LLTV or a newly created market.

### Actual published acceptance requirements

| Requirement | What Reach must supply or verify |
|---|---|
| Market definition | Concrete `loanToken`, `collateralToken`, `oracle`, `irm` and `lltv` addresses/values |
| Receipt token | ERC-20 behavior compatible with Morpho's documented token assumptions, including transfers and approvals |
| Interest model and LLTV | Values enabled on the deployed Morpho contract; market creation is permissionless but those parameters are constrained |
| Oracle interface | An `IOracle.price()` implementation with correct collateral/loan scaling; documentation specifies 1e36 scaling for base-unit valuation |
| Receipt valuation | A defensible value incorporating backing, redemption availability and cross-chain risk; do not assume a fixed $1 price or that a native conversion-rate read solves liquidations |
| Loan liquidity | Actual lenders supplying the loan asset; creating the market does not create USDC liquidity |
| Liquidations | A tested path for a liquidator to realize value from seized receipts, including asynchronous redemption and potential illiquidity |
| Initialization protection | Follow the documented dead-deposit/front-running protections; distinguish interface requirements from the bare contract's creation checks |
| Interface visibility | Separate from permissionless contract access; creating a market does not ensure display or endorsement in Morpho's official interface |

Public requirements sources:

- https://docs.morpho.org/curate/tutorials-market-v1/creating-market/
- https://docs.morpho.org/developers/contracts/blue/
- https://docs.morpho.org/curate/tutorials-market-v1/deploying-oracle/
- https://docs.morpho.org/developers/contracts/addresses/
- https://docs.morpho.org/get-started/resources/interface-listing-policy/
- https://raw.githubusercontent.com/morpho-org/morpho-blue/main/src/Morpho.sol

These are technical contract and interface requirements obtained from public primary sources. No Morpho team member, market curator or prospective borrower was contacted. Their willingness to adopt Reach remains unvalidated.

No official Base Sepolia Morpho endpoint was established from the address registry during this investigation. A testnet deployment of upstream Morpho source can be a clearly disclosed integration test, but must not be described as an existing independent market/adopter. Alternatively, validate against the real Base deployment in a labelled local fork, which also is not a live testnet or mainnet integration.

A lower-complexity compatibility target is Safe on Base: owners can hold and authorize transfers of an ERC-20 receipt. That offers a treasury governance workflow but is weaker evidence of unique demand than actual lending use. Generic ERC-20 custody alone is insufficient to claim a product partnership.

## 6. What should happen before the full build

1. Correct the PRD's economic model and decide whether remote receipts represent accumulating-wrapper shares or principal plus separately allocated yield.
2. Confirm the testnet savings deployment is the sponsor's recommended developer endpoint; pin source, implementation and underlying addresses.
3. Implement source wrapper/custody and application-owned bidirectional messengers using the verified transport foundation.
4. Execute one new complete savings-backed receipt lifecycle on public testnets, including an authenticated return and application-specific replay rejection.
5. For Morpho, validate the actual market/oracle interface and liquidation economics before presenting borrowing as available. Establish a borrower/curator need separately from permissionless compatibility.
6. Publish only claims supported by that implementation and its recorded receipts.

**Assessment:** Keep the idea under active consideration. Vault availability and authenticated transport are no longer merely speculative. Yield accounting needs material revision, and receiving-app adoption remains a hypothesis. The full Reach lifecycle cannot honestly be marked passed yet.
