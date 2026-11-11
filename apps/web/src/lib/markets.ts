"use client";

import { useQuery } from "@tanstack/react-query";
import { encodeAbiParameters, keccak256, parseAbi, type Address, type Hex } from "viem";
import { reachDestinationGatewayAbi } from "@musd-reach/sdk";
import siteData from "@/generated/site-data.json";
import { useClients } from "./hooks";
import { reachConfig } from "./reach";

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
};

export type MarketRunStep = { id: string; title: string; chain: "mezo" | "base" | "offchain"; status: "PASS" | "FAIL"; txHash?: string; explorer?: string; details: Record<string, unknown> };
export type MarketRun = { kind: "PUBLIC_TESTNET_MARKETS_RUN"; runId: string; startedAt: string; account: string; steps: MarketRunStep[]; marketState: { totalSupplyAssets: string; totalBorrowAssets: string } };

const data = siteData as unknown as { markets?: MarketsDeployment | null; marketRuns?: MarketRun[] };
export const markets: MarketsDeployment | null = data.markets ?? null;
export const marketRuns: MarketRun[] = data.marketRuns ?? [];

export const USDC_DECIMALS = 6;
export const WAD = 10n ** 18n;
const ORACLE_SCALE = 10n ** 36n;
const VIRTUAL_SHARES = 10n ** 6n;
const VIRTUAL_ASSETS = 1n;
const YEAR = 365n * 24n * 3600n;

export const marketParams = markets
  ? {
      loanToken: markets.loanToken,
      collateralToken: markets.collateralToken,
      oracle: markets.oracle,
      irm: markets.irm,
      lltv: BigInt(markets.lltv),
    }
  : null;

const tuple = "(address loanToken, address collateralToken, address oracle, address irm, uint256 lltv)";
export const morphoAbi = parseAbi([
  `function supplyCollateral(${tuple} marketParams, uint256 assets, address onBehalf, bytes data)`,
  `function withdrawCollateral(${tuple} marketParams, uint256 assets, address onBehalf, address receiver)`,
  `function borrow(${tuple} marketParams, uint256 assets, uint256 shares, address onBehalf, address receiver) returns (uint256, uint256)`,
  `function repay(${tuple} marketParams, uint256 assets, uint256 shares, address onBehalf, bytes data) returns (uint256, uint256)`,
  "function market(bytes32 id) view returns (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee)",
  "function position(bytes32 id, address user) view returns (uint256 supplyShares, uint128 borrowShares, uint128 collateral)",
]);
export const irmAbi = parseAbi([
  `function borrowRateView(${tuple} marketParams, (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee) market) view returns (uint256)`,
]);
export const vaultAbi = parseAbi([
  "function deposit(uint256 assets, address onBehalf) returns (uint256)",
  "function redeem(uint256 shares, address receiver, address onBehalf) returns (uint256)",
  "function withdraw(uint256 assets, address receiver, address onBehalf) returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function totalAssets() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function convertToAssets(uint256 shares) view returns (uint256)",
  "function maxWithdraw(address) view returns (uint256)",
  "function performanceFee() view returns (uint96)",
]);
export const oracleAbi = parseAbi(["function price() view returns (uint256)", "function navPrice() view returns (uint256)"]);
export const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
]);

export function computedMarketId(): Hex | null {
  if (!marketParams) return null;
  return keccak256(
    encodeAbiParameters(
      [{ type: "tuple", components: [{ name: "loanToken", type: "address" }, { name: "collateralToken", type: "address" }, { name: "oracle", type: "address" }, { name: "irm", type: "address" }, { name: "lltv", type: "uint256" }] }],
      [marketParams],
    ),
  );
}

const toAssetsUp = (shares: bigint, totalAssets: bigint, totalShares: bigint) =>
  (shares * (totalAssets + VIRTUAL_ASSETS) + (totalShares + VIRTUAL_SHARES) - 1n) / (totalShares + VIRTUAL_SHARES);

export type MarketState = {
  totalSupply: bigint;
  totalBorrow: bigint;
  liquidity: bigint;
  utilization: number;
  borrowApr: number | null;
  supplyApr: number | null;
  vaultApr: number | null;
  performanceFee: number;
  vaultTotalAssets: bigint;
  /** USDC per 1e18 rwSMUSD, after haircut, 1e36-scaled; null if NAV is stale or missing. */
  price: bigint | null;
  navPerShare: bigint | null;
  navAgeSeconds: number | null;
  navFresh: boolean;
  navMaxAge: number;
  lltv: bigint;
  haircutBps: number;
  position?: {
    collateral: bigint;
    borrowed: bigint;
    borrowShares: bigint;
    usdc: bigint;
    rwsmusd: bigint;
    vaultShares: bigint;
    vaultAssets: bigint;
    maxBorrow: bigint | null;
    collateralValue: bigint | null;
    health: number | null;
    usdcAllowanceVault: bigint;
    usdcAllowanceMorpho: bigint;
    rwAllowanceMorpho: bigint;
  };
};

export function useMarket(account?: Address) {
  const c = useClients();
  const d = reachConfig.deployment;
  return useQuery({
    queryKey: ["reach-market", account],
    enabled: !!c && !!markets && !!d,
    refetchInterval: 15_000,
    queryFn: async (): Promise<MarketState> => {
      const m = markets!;
      const p = marketParams!;
      const base = c!.base;
      const id = m.marketId;
      const [mk, navRaw, hasNav, block, vaultTotal, perf] = await Promise.all([
        base.readContract({ address: m.morpho, abi: morphoAbi, functionName: "market", args: [id] }),
        base.readContract({ address: d!.destinationGateway, abi: reachDestinationGatewayAbi, functionName: "latestNav" }),
        base.readContract({ address: d!.destinationGateway, abi: reachDestinationGatewayAbi, functionName: "hasNav" }),
        base.getBlock(),
        base.readContract({ address: m.vault, abi: vaultAbi, functionName: "totalAssets" }),
        base.readContract({ address: m.vault, abi: vaultAbi, functionName: "performanceFee" }),
      ]);
      const [totalSupply, , totalBorrow, totalBorrowShares, lastUpdate, fee] = mk;
      const nav = navRaw as readonly [bigint, bigint, bigint, bigint, bigint];
      const navAge = hasNav ? Math.max(0, Number(block.timestamp - nav[2])) : null;
      const navMaxAge = Number(m.navMaxAge);
      const price = await base.readContract({ address: p.oracle, abi: oracleAbi, functionName: "price" }).catch(() => null);
      let borrowApr: number | null = null;
      if (lastUpdate > 0n) {
        const rate = await base
          .readContract({ address: p.irm, abi: irmAbi, functionName: "borrowRateView", args: [p, { totalSupplyAssets: mk[0], totalSupplyShares: mk[1], totalBorrowAssets: mk[2], totalBorrowShares: mk[3], lastUpdate: mk[4], fee: mk[5] }] })
          .catch(() => null);
        if (rate !== null) borrowApr = Number(rate * YEAR) / 1e18;
      }
      const utilization = totalSupply > 0n ? Number((totalBorrow * 10_000n) / totalSupply) / 10_000 : 0;
      const supplyApr = borrowApr === null ? null : borrowApr * utilization * (1 - Number(fee) / 1e18);
      const performanceFee = Number(perf) / 1e18;
      const state: MarketState = {
        totalSupply,
        totalBorrow,
        liquidity: totalSupply - totalBorrow,
        utilization,
        borrowApr,
        supplyApr,
        vaultApr: supplyApr === null ? null : supplyApr * (1 - performanceFee),
        performanceFee,
        vaultTotalAssets: vaultTotal,
        price,
        navPerShare: hasNav && nav[1] > 0n ? ((nav[0] + 1n) * WAD) / (nav[1] + 1n) : null,
        navAgeSeconds: navAge,
        navFresh: navAge !== null && navAge <= navMaxAge,
        navMaxAge,
        lltv: p.lltv,
        haircutBps: Number(m.haircutBps),
      };
      if (account) {
        const [pos, usdc, rw, vShares, aV, aM, aR] = await Promise.all([
          base.readContract({ address: m.morpho, abi: morphoAbi, functionName: "position", args: [id, account] }),
          base.readContract({ address: p.loanToken, abi: erc20Abi, functionName: "balanceOf", args: [account] }),
          base.readContract({ address: p.collateralToken, abi: erc20Abi, functionName: "balanceOf", args: [account] }),
          base.readContract({ address: m.vault, abi: vaultAbi, functionName: "balanceOf", args: [account] }),
          base.readContract({ address: p.loanToken, abi: erc20Abi, functionName: "allowance", args: [account, m.vault] }),
          base.readContract({ address: p.loanToken, abi: erc20Abi, functionName: "allowance", args: [account, m.morpho] }),
          base.readContract({ address: p.collateralToken, abi: erc20Abi, functionName: "allowance", args: [account, m.morpho] }),
        ]);
        const vaultAssets = vShares > 0n ? await base.readContract({ address: m.vault, abi: vaultAbi, functionName: "convertToAssets", args: [vShares] }) : 0n;
        const collateral = BigInt(pos[2]);
        const borrowed = toAssetsUp(BigInt(pos[1]), totalBorrow, totalBorrowShares);
        const collateralValue = price === null ? null : (collateral * price) / ORACLE_SCALE;
        const maxBorrow = collateralValue === null ? null : (collateralValue * p.lltv) / WAD;
        state.position = {
          collateral,
          borrowed,
          borrowShares: BigInt(pos[1]),
          usdc,
          rwsmusd: rw,
          vaultShares: vShares,
          vaultAssets,
          maxBorrow,
          collateralValue,
          health: maxBorrow === null || borrowed === 0n ? null : Number((maxBorrow * 10_000n) / borrowed) / 10_000,
          usdcAllowanceVault: aV,
          usdcAllowanceMorpho: aM,
          rwAllowanceMorpho: aR,
        };
      }
      return state;
    },
  });
}

export const pct = (x: number | null, places = 2) => (x === null ? "—" : `${(x * 100).toFixed(places)}%`);
export const ageLabel = (s: number | null) => (s === null ? "no snapshot" : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 172_800 ? `${(s / 3600).toFixed(1)} h ago` : `${(s / 86_400).toFixed(1)} days ago`);

const activityEvents = parseAbi([
  "event Deposit(address indexed sender, address indexed onBehalf, uint256 assets, uint256 shares)",
  "event SupplyCollateral(bytes32 indexed id, address indexed caller, address indexed onBehalf, uint256 assets)",
  "event Borrow(bytes32 indexed id, address caller, address indexed onBehalf, address indexed receiver, uint256 assets, uint256 shares)",
  "event Repay(bytes32 indexed id, address indexed caller, address indexed onBehalf, uint256 assets, uint256 shares)",
]);

export type MarketActivity = { lenders: Address[]; borrowers: Address[]; wallets: Address[]; deposits: number; borrows: number; repays: number; scannedTo: bigint };

/** Unique lenders and borrowers, read straight from vault and Morpho logs since deployment. */
export function useMarketActivity() {
  const c = useClients();
  return useQuery({
    queryKey: ["reach-market-activity"],
    enabled: !!c && !!markets,
    refetchInterval: 60_000,
    staleTime: 30_000,
    queryFn: async (): Promise<MarketActivity> => {
      const m = markets!;
      const base = c!.base;
      const head = await base.getBlockNumber();
      const from = BigInt(m.deployBlock);
      const lenders = new Set<Address>();
      const borrowers = new Set<Address>();
      let deposits = 0, borrows = 0, repays = 0;
      const STEP = 9_000n;
      for (let start = from; start <= head; start += STEP + 1n) {
        const end = start + STEP > head ? head : start + STEP;
        const [vaultLogs, morphoLogs] = await Promise.all([
          base.getLogs({ address: m.vault, event: activityEvents[0], fromBlock: start, toBlock: end }),
          base.getLogs({ address: m.morpho, events: activityEvents.slice(1), args: { id: m.marketId } as never, fromBlock: start, toBlock: end }),
        ]);
        for (const l of vaultLogs) { lenders.add(l.args.onBehalf!); deposits++; }
        for (const l of morphoLogs) {
          const a = l.args as { onBehalf?: Address };
          if (l.eventName === "SupplyCollateral" && a.onBehalf) borrowers.add(a.onBehalf);
          if (l.eventName === "Borrow") { borrows++; if (a.onBehalf) borrowers.add(a.onBehalf); }
          if (l.eventName === "Repay") repays++;
        }
      }
      const wallets = [...new Set([...lenders, ...borrowers])];
      return { lenders: [...lenders], borrowers: [...borrowers], wallets, deposits, borrows, repays, scannedTo: head };
    },
  });
}
