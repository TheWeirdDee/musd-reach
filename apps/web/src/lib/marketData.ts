// Recorded market deployments and their definitions: plain data, safe to import from server
// components (lib/markets.ts is a client module, so its exports are client references on the server).
import type { Address, Hex } from "viem";
import siteData from "@/generated/site-data.json";

/** Base Sepolia market layer recorded by DeployReachMarkets (deployments/testnet-markets.json). */
export type MarketsDeployment = {
  chainId: number;
  morpho: Address;
  irm: Address;
  loanToken: Address;
  collateralToken: Address;
  oracle: Address;
  lltv: string | number;
  navMaxAge: string | number;
  haircutBps: string | number;
  marketId: Hex;
  vault: Address;
  vaultAdapter: Address;
  curator: Address;
  treasury: Address;
  performanceFee: string | number;
  deployBlock: string | number;
  /** Base Sepolia transaction that created the Morpho market (Morpho's app does not list testnets). */
  createMarketTx?: Hex;
};

export type MarketRunStep = { id: string; title: string; chain: "mezo" | "base" | "offchain"; status: "PASS" | "FAIL"; txHash?: string; explorer?: string; details: Record<string, unknown> };
export type MarketRun = { kind: "PUBLIC_TESTNET_MARKETS_RUN"; loanAsset?: LoanAsset; runId: string; startedAt: string; account: string; steps: MarketRunStep[]; marketState: { totalSupplyAssets: string; totalBorrowAssets: string } };
export type StarterKitDeployment = { chainId: number; starterKit: Address; musd: Address; kitAmount: string; dailyLimit: number; funded: string; owner: Address; deployBlock: number };
export type MusdBridgeRun = { kind: "PUBLIC_TESTNET_MUSD_BRIDGE"; direction: string; amount: string; transferTx: Hex; deliverTx: Hex; recordedAt: string };

const data = siteData as unknown as { markets?: MarketsDeployment | null; marketsMusd?: MarketsDeployment | null; marketRuns?: MarketRun[]; starterKit?: StarterKitDeployment | null; musdBridgeRuns?: MusdBridgeRun[] };
/** Relayer-sent tester kits (deployments/testnet-tester-kit-*.json): no tokens needed to start. */
export type TesterKitDeployment = { chainId: number; testerKit: Address; token: Address; tokenPerKit: string | number; nativePerKit: string | number; dailyLimit: number; relayer: Address; owner: Address; deployBlock: number };
export const testerKits: { mezo: TesterKitDeployment | null; base: TesterKitDeployment | null } = {
  mezo: (siteData as unknown as { testerKits?: { mezo?: TesterKitDeployment | null } }).testerKits?.mezo ?? null,
  base: (siteData as unknown as { testerKits?: { base?: TesterKitDeployment | null } }).testerKits?.base ?? null,
};

/** The USDC market (first deployed). */
export const markets: MarketsDeployment | null = data.markets ?? null;
/** The MUSD market: borrow Mezo's canonical MUSD on Base. */
export const musdMarket: MarketsDeployment | null = data.marketsMusd ?? null;
export const marketRuns: MarketRun[] = data.marketRuns ?? [];
export const starterKit: StarterKitDeployment | null = data.starterKit ?? null;
export const musdBridgeRuns: MusdBridgeRun[] = data.musdBridgeRuns ?? [];

export type LoanAsset = "USDC" | "MUSD";
export type MarketParams = { loanToken: Address; collateralToken: Address; oracle: Address; irm: Address; lltv: bigint };
export type MarketDef = {
  asset: LoanAsset;
  decimals: number;
  vaultName: string;
  vaultSymbol: string;
  cfg: MarketsDeployment;
  params: MarketParams;
};
const defOf = (asset: LoanAsset, cfg: MarketsDeployment | null): MarketDef | null =>
  cfg
    ? {
        asset,
        decimals: asset === "MUSD" ? 18 : 6,
        vaultName: `Reach ${asset} Vault`,
        vaultSymbol: `reach${asset}`,
        cfg,
        params: { loanToken: cfg.loanToken, collateralToken: cfg.collateralToken, oracle: cfg.oracle, irm: cfg.irm, lltv: BigInt(cfg.lltv) },
      }
    : null;
/** Every live market, MUSD first: it keeps the whole loop in Mezo's own stablecoin. */
export const marketDefs: MarketDef[] = [defOf("MUSD", musdMarket), defOf("USDC", markets)].filter((d): d is MarketDef => d !== null);
export const marketDef = (asset: LoanAsset): MarketDef | null => marketDefs.find((d) => d.asset === asset) ?? null;
