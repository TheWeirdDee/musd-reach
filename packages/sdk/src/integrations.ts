/**
 * Integration registry. Statuses are deliberately conservative and must only change when an
 * evidence artifact exists. Vocabulary:
 *   LIVE                   — used on a public network by an independent party, with evidence
 *   PUBLIC_TESTNET_VERIFIED — Reach-run transactions on public testnets, recorded in evidence/
 *   FORK_COMPATIBILITY     — tested against real contracts on a local fork only
 *   RESEARCH               — requirements documented; nothing executed
 *   NOT_INTEGRATED         — no work beyond assessment
 */
export const integrations = [
  {
    id: "erc20-transfer",
    name: "Standard ERC-20 transfer of rwSMUSD",
    network: "Base Sepolia",
    status: "PUBLIC_TESTNET_VERIFIED",
    detail:
      "rwSMUSD is a plain ERC-20 with permit. In the v2 public run the primary transferred rwSMUSD to a second holder (Base Sepolia tx 0x52c1cdaa9a…), who burned it and received the exact locked wSMUSD on Mezo. Both wallets are Reach test wallets; no independent party has used rwSMUSD.",
    evidence: ["evidence/real-chain/testnet-2026-10-21T11-23-33-084Z.json"],
  },
  {
    id: "morpho-blue",
    name: "Morpho Blue (collateral market)",
    network: "Base Sepolia",
    status: "PUBLIC_TESTNET_VERIFIED",
    detail:
      "Live on Base Sepolia: a Morpho Blue market (market id 0x040e75a0…72c4) lends Circle USDC against rwSMUSD collateral at 77% LLTV, priced by the verified ReachNavOracle (0xB6f6…1817) from guardian-attested Mezo savings NAV with a 10% haircut and a 72-hour freshness bound kept fresh by a scheduled keeper. Lenders deposit through the Reach USDC Vault (Morpho Vault V2, 0x30f9…Faab8), which routes every deposit into the market and pays a 10% performance fee to the Reach treasury. The recorded run made Mezo savings portable, lent USDC through the vault, posted rwSMUSD as collateral, borrowed USDC and repaid, with every step on public explorers. The same market design was also exercised on a Base-mainnet fork, including liquidation after an impaired NAV.",
    evidence: [
      "evidence/markets/markets-2026-11-11T16-25-38-477Z.json",
      "evidence/markets/nav-2026-11-11T16-25-59-895Z.json",
      "deployments/testnet-markets.json",
      "packages/contracts/test/fork/ReachMarketsFork.t.sol",
      "packages/contracts/test/fork/MorphoCompatibilityFork.t.sol",
    ],
    blockers: [
      "Mainnet launch needs a MUSD/USD price feed in the oracle (MUSD is valued at par today).",
      "Independent risk review of the haircut and LLTV before real liquidity.",
    ],
  },
  {
    id: "safe",
    name: "Safe multisig custody of rwSMUSD",
    network: "Base Sepolia",
    status: "NOT_INTEGRATED",
    detail: "Any ERC-20 can be held by a Safe; this is generic compatibility, not a partnership.",
    evidence: [],
  },
  {
    id: "musd-ntt",
    name: "Mezo's canonical MUSD bridge (Wormhole NTT)",
    network: "Mezo testnet ↔ Base Sepolia",
    status: "PUBLIC_TESTNET_VERIFIED",
    detail:
      "Reach moves MUSD between Mezo and Base on Mezo's own bridge: the Mezo NttManager locks MUSD and the Base NttManager mints canonical MUSD on Base, the loan asset of the rwSMUSD/MUSD market. Reach sends with relaying skipped and delivers the guardian-signed message itself through the permissionless WormholeTransceiver.receiveMessage, in the app (Bridge MUSD) and in scripts. The bridge has no authority over rwSMUSD.",
    evidence: ["evidence/markets/musd-bridge-base-2026-11-11T18-16-49-477Z.json", "scripts/bridge-musd.ts", "docs/MEZO_INTEGRATION.md"],
  },
] as const;
