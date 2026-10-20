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
    status: "PENDING_PUBLIC_RUN",
    detail: "rwSMUSD is a plain ERC-20 with permit. Transfer to a second holder who then redeems is part of the canonical run.",
    evidence: [],
  },
  {
    id: "morpho-blue",
    name: "Morpho Blue (collateral market)",
    network: "Base mainnet (local fork only)",
    status: "FORK_COMPATIBILITY",
    detail:
      "On a local Base-mainnet fork: the real Morpho Blue accepted a market with rwSMUSD collateral, USDC loan, the enabled Adaptive Curve IRM and 38.5% LLTV, priced by ReachNavOracle from authenticated NAV snapshots. Borrow limits, liquidation after an impaired NAV, the liquidator's asynchronous exit, and the stale-NAV failure mode were exercised. No Reach market exists on any public network; no lender, curator or borrower has adopted it; borrowing is not available.",
    evidence: ["packages/contracts/test/fork/MorphoCompatibilityFork.t.sol"],
    blockers: [
      "No MUSD/USD price feed in the oracle (MUSD valued at par).",
      "Static haircut; no model of redemption latency or receipt liquidity.",
      "Stale NAV blocks liquidations (Morpho oracle reverts).",
      "No real USDC liquidity, curator or independent risk review.",
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
    name: "Canonical MUSD bridge (Wormhole NTT)",
    network: "Mezo testnet ↔ Base Sepolia",
    status: "SEPARATE_PROTOCOL",
    detail:
      "The canonical MUSD bridge is independent of Reach and has no authority over rwSMUSD. Users holding MUSD on Base can bridge it to Mezo themselves before using Reach.",
    evidence: ["MUSD_Reach_Verification_Report.md"],
  },
] as const;
