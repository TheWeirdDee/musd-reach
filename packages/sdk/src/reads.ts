import {
  createPublicClient,
  fallback,
  http,
  getAddress,
  parseAbiItem,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import {
  musdSavingsRateAbi,
  reachDestinationGatewayAbi,
  reachSavingsWrapperAbi,
  reachSourceGatewayAbi,
  remoteWrapperReceiptAbi,
} from "./abis";
import type { ReachConfig, ReachDeployment } from "./config";

const erc20 = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "o", type: "address" }, { name: "s", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

const IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" as const;

export type ReachClients = { mezo: PublicClient; base: PublicClient };

export function createReachClients(cfg: ReachConfig): ReachClients {
  const t = (urls: string[]) => fallback(urls.map((u) => http(u, { timeout: 20_000, retryCount: 2 })), { rank: false });
  return {
    mezo: createPublicClient({ chain: cfg.mezo.chain, transport: t(cfg.mezo.rpcUrls) }) as PublicClient,
    base: createPublicClient({ chain: cfg.base.chain, transport: t(cfg.base.rpcUrls) }) as PublicClient,
  };
}

export function requireDeployment(cfg: ReachConfig): ReachDeployment {
  if (!cfg.deployment) throw new Error("Reach is not deployed: no deployment recorded in deployments/testnet.json");
  return cfg.deployment;
}

// ---------------------------------------------------------------------------
// Native vault
// ---------------------------------------------------------------------------

export type NativeVaultState = {
  blockNumber: bigint;
  implementation: Address;
  implementationMatchesRegistry: boolean;
  totalSupply: bigint;
  yieldIndex: bigint;
  pendingYield: bigint;
  pcv: Address;
  strategy: Address;
};

export async function readNativeVaultState(mezo: PublicClient, cfg: ReachConfig): Promise<NativeVaultState> {
  const blockNumber = await mezo.getBlockNumber();
  const v = { address: cfg.mezo.savingsVault, abi: musdSavingsRateAbi, blockNumber } as const;
  const [slot, totalSupply, yieldIndex, pendingYield, pcv, strategy] = await Promise.all([
    mezo.getStorageAt({ address: cfg.mezo.savingsVault, slot: IMPL_SLOT, blockNumber }),
    mezo.readContract({ ...v, functionName: "totalSupply" }),
    mezo.readContract({ ...v, functionName: "yieldIndex" }),
    mezo.readContract({ ...v, functionName: "pendingYield" }),
    mezo.readContract({ ...v, functionName: "pcv" }),
    mezo.readContract({ ...v, functionName: "strategy" }),
  ]);
  const implementation = getAddress(`0x${(slot ?? "0x").slice(-40)}`);
  return {
    blockNumber,
    implementation,
    implementationMatchesRegistry: implementation === cfg.mezo.savingsVaultImplementation,
    totalSupply,
    yieldIndex,
    pendingYield,
    pcv,
    strategy,
  };
}

/** Exactly mirrors MUSDSavingsRate._updateYieldFor for a view of claimable yield. */
export async function readNativeClaimable(mezo: PublicClient, cfg: ReachConfig, account: Address, blockNumber?: bigint) {
  const v = { address: cfg.mezo.savingsVault, abi: musdSavingsRateAbi, blockNumber } as const;
  const [bal, accrued, idx, userIdx] = await Promise.all([
    mezo.readContract({ ...v, functionName: "balanceOf", args: [account] }),
    mezo.readContract({ ...v, functionName: "claimableYield", args: [account] }),
    mezo.readContract({ ...v, functionName: "yieldIndex" }),
    mezo.readContract({ ...v, functionName: "supplyYieldIndex", args: [account] }),
  ]);
  return { principal: bal, claimable: bal === 0n ? accrued : accrued + (bal * (idx - userIdx)) / 10n ** 18n };
}

// ---------------------------------------------------------------------------
// Wrapper
// ---------------------------------------------------------------------------

export type WrapperState = {
  blockNumber: bigint;
  blockTimestamp: bigint;
  principal: bigint;
  idle: bigint;
  pendingYield: bigint;
  totalAssets: bigint;
  totalSupply: bigint;
  /** MUSD base units per 1e18 wSMUSD, rounded down (wrapper's ERC-4626 conversion). */
  assetsPerShare: bigint;
  depositsPaused: boolean;
  nativeSmusdHeld: bigint;
  musdHeld: bigint;
};

export async function readWrapperState(mezo: PublicClient, cfg: ReachConfig, atBlock?: bigint): Promise<WrapperState> {
  const d = requireDeployment(cfg);
  const block = atBlock === undefined ? await mezo.getBlock() : await mezo.getBlock({ blockNumber: atBlock });
  const blockNumber = block.number;
  const w = { address: d.wrapper, abi: reachSavingsWrapperAbi, blockNumber } as const;
  const [principal, idle, pendingYield, totalAssets, totalSupply, assetsPerShare, depositsPaused, nativeSmusdHeld, musdHeld] =
    await Promise.all([
      mezo.readContract({ ...w, functionName: "principal" }),
      mezo.readContract({ ...w, functionName: "idle" }),
      mezo.readContract({ ...w, functionName: "pendingYield" }),
      mezo.readContract({ ...w, functionName: "totalAssets" }),
      mezo.readContract({ ...w, functionName: "totalSupply" }),
      mezo.readContract({ ...w, functionName: "assetsPerShare" }),
      mezo.readContract({ ...w, functionName: "depositsPaused" }),
      mezo.readContract({ address: cfg.mezo.savingsVault, abi: erc20, functionName: "balanceOf", args: [d.wrapper], blockNumber }),
      mezo.readContract({ address: cfg.mezo.musd, abi: erc20, functionName: "balanceOf", args: [d.wrapper], blockNumber }),
    ]);
  return {
    blockNumber,
    blockTimestamp: block.timestamp,
    principal,
    idle,
    pendingYield,
    totalAssets,
    totalSupply,
    assetsPerShare,
    depositsPaused,
    nativeSmusdHeld,
    musdHeld,
  };
}

// ---------------------------------------------------------------------------
// Positions
// ---------------------------------------------------------------------------

export type Position = {
  account: Address;
  mezoBlock: bigint;
  baseBlock: bigint;
  musd: bigint;
  nativeSmusd: bigint;
  /** Native yield accrued to the account itself; never part of Reach. */
  nativeClaimableYield: bigint;
  wsmusd: bigint;
  wsmusdValueMusd: bigint | null;
  rwsmusd: bigint;
  rwsmusdIndicativeValueMusd: bigint | null;
  mezoGas: bigint;
  baseGas: bigint;
};

export async function readPosition(clients: ReachClients, cfg: ReachConfig, account: Address): Promise<Position> {
  const d = cfg.deployment;
  const [mezoBlock, baseBlock] = await Promise.all([clients.mezo.getBlockNumber(), clients.base.getBlockNumber()]);
  const m = (address: Address, args: readonly [Address]) =>
    clients.mezo.readContract({ address, abi: erc20, functionName: "balanceOf", args, blockNumber: mezoBlock });
  const [musd, native, mezoGas, baseGas] = await Promise.all([
    m(cfg.mezo.musd, [account]),
    readNativeClaimable(clients.mezo, cfg, account, mezoBlock),
    clients.mezo.getBalance({ address: account, blockNumber: mezoBlock }),
    clients.base.getBalance({ address: account, blockNumber: baseBlock }),
  ]);
  let wsmusd = 0n;
  let wsmusdValueMusd: bigint | null = null;
  let rwsmusd = 0n;
  let rwsmusdIndicativeValueMusd: bigint | null = null;
  if (d) {
    wsmusd = await m(d.wrapper, [account]);
    wsmusdValueMusd = await clients.mezo.readContract({
      address: d.wrapper,
      abi: reachSavingsWrapperAbi,
      functionName: "convertToAssets",
      args: [wsmusd],
      blockNumber: mezoBlock,
    });
    rwsmusd = await clients.base.readContract({
      address: d.receipt,
      abi: erc20,
      functionName: "balanceOf",
      args: [account],
      blockNumber: baseBlock,
    });
    rwsmusdIndicativeValueMusd = await clients.mezo.readContract({
      address: d.wrapper,
      abi: reachSavingsWrapperAbi,
      functionName: "convertToAssets",
      args: [rwsmusd],
      blockNumber: mezoBlock,
    });
  }
  return {
    account,
    mezoBlock,
    baseBlock,
    musd,
    nativeSmusd: native.principal,
    nativeClaimableYield: native.claimable,
    wsmusd,
    wsmusdValueMusd,
    rwsmusd,
    rwsmusdIndicativeValueMusd,
    mezoGas,
    baseGas,
  };
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export const reachEvents = {
  sharesLocked: parseAbiItem(
    "event SharesLocked(bytes32 indexed transferId, address indexed sender, address indexed recipient, uint256 shares, uint64 sequence, uint64 nonce)",
  ),
  sharesReleased: parseAbiItem("event SharesReleased(bytes32 indexed transferId, address indexed recipient, uint256 shares, uint8 mode)"),
  redeemedToMusd: parseAbiItem("event RedeemedToMusd(bytes32 indexed transferId, address indexed recipient, uint256 shares, uint256 assets)"),
  settlementPending: parseAbiItem(
    "event SettlementPending(bytes32 indexed transferId, address indexed recipient, uint256 shares, uint256 minAssets, bytes reason)",
  ),
  pendingSharesClaimed: parseAbiItem(
    "event PendingSettlementSharesClaimed(bytes32 indexed transferId, address indexed recipient, uint256 shares)",
  ),
  receiptMinted: parseAbiItem("event ReceiptMinted(bytes32 indexed transferId, address indexed recipient, uint256 shares)"),
  receiptBurned: parseAbiItem(
    "event ReceiptBurned(bytes32 indexed transferId, address indexed holder, address indexed recipient, uint256 shares, uint8 mode, uint64 sequence, uint64 nonce)",
  ),
  navPublished: parseAbiItem(
    "event NavPublished(bytes32 indexed transferId, uint256 navAssets, uint256 navSupply, uint64 navTimestamp, uint64 sequence)",
  ),
  messagePublished: parseAbiItem(
    "event MessagePublished(bytes32 indexed transferId, uint64 indexed sequence, uint64 nonce, uint8 direction)",
  ),
} as const;

/** getLogs in fixed-size windows; public RPCs cap block ranges. */
export async function getLogsChunked<T>(
  fetchRange: (fromBlock: bigint, toBlock: bigint) => Promise<T[]>,
  fromBlock: bigint,
  toBlock: bigint,
  step = 9_000n,
): Promise<T[]> {
  const out: T[] = [];
  for (let start = fromBlock; start <= toBlock; start += step + 1n) {
    const end = start + step > toBlock ? toBlock : start + step;
    out.push(...(await fetchAdaptive(fetchRange, start, end)));
  }
  return out;
}

/** Public RPCs cap getLogs ranges differently (Base Sepolia: 200 blocks). Split on rejection. */
export async function fetchAdaptive<T>(fetchRange: (a: bigint, b: bigint) => Promise<T[]>, from: bigint, to: bigint): Promise<T[]> {
  try {
    return await fetchRange(from, to);
  } catch (e) {
    const msg = String((e as Error).message ?? e);
    // HTTP 413 is how sepolia.base.org rejects wide eth_getLogs ranges.
    if (to <= from || !/range|limit|too many|exceed|413|too large/i.test(msg)) throw e;
    const mid = from + (to - from) / 2n;
    return [...(await fetchAdaptive(fetchRange, from, mid)), ...(await fetchAdaptive(fetchRange, mid + 1n, to))];
  }
}

export type IssueRecord = { transferId: Hex; sender: Address; recipient: Address; shares: bigint; sequence: bigint; nonce: bigint; txHash: Hex; blockNumber: bigint };
export type BurnRecord = { transferId: Hex; holder: Address; recipient: Address; shares: bigint; mode: number; sequence: bigint; nonce: bigint; txHash: Hex; blockNumber: bigint };

export async function listIssues(mezo: PublicClient, d: ReachDeployment, toBlock: bigint): Promise<IssueRecord[]> {
  const logs = await getLogsChunked(
    (fromBlock, to) => mezo.getLogs({ address: d.sourceGateway, event: reachEvents.sharesLocked, fromBlock, toBlock: to }),
    d.sourceDeployBlock,
    toBlock,
  );
  return logs.map((l) => ({
    transferId: l.args.transferId!,
    sender: l.args.sender!,
    recipient: l.args.recipient!,
    shares: l.args.shares!,
    sequence: l.args.sequence!,
    nonce: l.args.nonce!,
    txHash: l.transactionHash!,
    blockNumber: l.blockNumber!,
  }));
}

export async function listBurns(base: PublicClient, d: ReachDeployment, toBlock: bigint): Promise<BurnRecord[]> {
  const logs = await getLogsChunked(
    (fromBlock, to) => base.getLogs({ address: d.destinationGateway, event: reachEvents.receiptBurned, fromBlock, toBlock: to }),
    d.destinationDeployBlock,
    toBlock,
    1_999n,
  );
  return logs.map((l) => ({
    transferId: l.args.transferId!,
    holder: l.args.holder!,
    recipient: l.args.recipient!,
    shares: l.args.shares!,
    mode: Number(l.args.mode!),
    sequence: l.args.sequence!,
    nonce: l.args.nonce!,
    txHash: l.transactionHash!,
    blockNumber: l.blockNumber!,
  }));
}

// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------

export type Reconciliation = {
  /** AWAITING_FINALITY: the Base deployment block is not yet at the requested tag, so nothing can be reconciled. */
  status: "BALANCED" | "MISMATCH" | "AWAITING_FINALITY";
  mezoBlock: bigint;
  /** Base block the snapshot was read at, resolved from `baseBlockTag`. */
  baseBlock: bigint;
  baseBlockTag: "finalized" | "latest";
  totalLocked: bigint;
  custodyBalance: bigint;
  remoteSupply: bigint;
  pendingIssues: IssueRecord[];
  pendingIssueShares: bigint;
  pendingRedemptions: BurnRecord[];
  pendingRedemptionShares: bigint;
  /** totalLocked - (remoteSupply + pendingIssueShares + pendingRedemptionShares) */
  discrepancy: bigint;
  /** wSMUSD held for consumed MUSD redemptions that have not settled yet. */
  pendingSettlement: bigint;
  checks: { name: string; ok: boolean; detail: string }[];
};

/**
 * Independent backing check from chain state only.
 *
 * Ordering argument: Base is snapshotted at its *latest* block B first, then Mezo at its latest
 * block M (Mezo has instant finality). Every mint visible at B consumed an ISSUE that was locked
 * on Mezo before B was read, so it is visible at M. A burn after B cannot already be released
 * at M: release needs a guardian attestation of the burn, which takes minutes on Base Sepolia,
 * while M is read seconds after B. Equality must therefore be exact at (B, M).
 *
 * The `finalized` tag is deliberately not the default: on 2026-10-21 the RPC `finalized` head
 * lagged behind blocks whose burns the guardians had already attested and Mezo had released,
 * which produced a false MISMATCH (finding F-13). `finalized` remains available as an option.
 */
export async function reconcile(
  clients: ReachClients,
  cfg: ReachConfig,
  opts: { baseBlockTag?: "finalized" | "latest" } = { baseBlockTag: "latest" },
): Promise<Reconciliation> {
  const d = requireDeployment(cfg);
  const baseBlockTag = opts.baseBlockTag ?? "latest";
  const baseBlock = (await clients.base.getBlock({ blockTag: baseBlockTag })).number;
  const mezoBlock = await clients.mezo.getBlockNumber();

  if (baseBlock < d.destinationDeployBlock) {
    return {
      status: "AWAITING_FINALITY",
      mezoBlock,
      baseBlock,
      baseBlockTag,
      totalLocked: 0n,
      custodyBalance: 0n,
      remoteSupply: 0n,
      pendingIssues: [],
      pendingIssueShares: 0n,
      pendingRedemptions: [],
      pendingRedemptionShares: 0n,
      pendingSettlement: 0n,
      discrepancy: 0n,
      checks: [
        {
          name: `Base deployment visible at ${baseBlockTag}`,
          ok: false,
          detail: `${baseBlockTag} head ${baseBlock} < destination deploy block ${d.destinationDeployBlock}; retry shortly`,
        },
      ],
    };
  }

  const src = { address: d.sourceGateway, abi: reachSourceGatewayAbi, blockNumber: mezoBlock } as const;
  const dst = { address: d.destinationGateway, abi: reachDestinationGatewayAbi, blockNumber: baseBlock } as const;

  const [totalLocked, totalIssued, totalReleased, custodyBalance, remoteSupply, totalMinted, totalBurned, issues, burns, pendingSettlement] =
    await Promise.all([
      clients.mezo.readContract({ ...src, functionName: "totalLocked" }),
      clients.mezo.readContract({ ...src, functionName: "totalIssued" }),
      clients.mezo.readContract({ ...src, functionName: "totalReleased" }),
      clients.mezo.readContract({ address: d.wrapper, abi: erc20, functionName: "balanceOf", args: [d.sourceGateway], blockNumber: mezoBlock }),
      clients.base.readContract({ address: d.receipt, abi: remoteWrapperReceiptAbi, functionName: "totalSupply", blockNumber: baseBlock }),
      clients.base.readContract({ ...dst, functionName: "totalMinted" }),
      clients.base.readContract({ ...dst, functionName: "totalBurned" }),
      listIssues(clients.mezo, d, mezoBlock),
      listBurns(clients.base, d, baseBlock),
      // Older deployments (before pending settlements existed) do not expose this getter.
      clients.mezo
        .readContract({ ...src, functionName: "totalPendingSettlement" })
        .catch(() => 0n),
    ]);

  const issueConsumed = await Promise.all(
    issues.map((i) => clients.base.readContract({ ...dst, functionName: "transferConsumed", args: [i.transferId] })),
  );
  const burnConsumed = await Promise.all(
    burns.map((b) => clients.mezo.readContract({ ...src, functionName: "transferConsumed", args: [b.transferId] })),
  );
  const pendingIssues = issues.filter((_, k) => !issueConsumed[k]);
  const pendingRedemptions = burns.filter((_, k) => !burnConsumed[k]);
  const pendingIssueShares = pendingIssues.reduce((s, i) => s + i.shares, 0n);
  const pendingRedemptionShares = pendingRedemptions.reduce((s, b) => s + b.shares, 0n);
  const discrepancy = totalLocked - (remoteSupply + pendingIssueShares + pendingRedemptionShares);

  const checks = [
    { name: "locked == remote supply + in-flight issues + in-flight redemptions", ok: discrepancy === 0n, detail: `discrepancy ${discrepancy}` },
    {
      name: "custody wSMUSD balance >= totalLocked + pending MUSD settlements",
      ok: custodyBalance >= totalLocked + pendingSettlement,
      detail: `${custodyBalance} >= ${totalLocked} + ${pendingSettlement}`,
    },
    { name: "totalLocked == totalIssued - totalReleased", ok: totalLocked === totalIssued - totalReleased, detail: `${totalLocked} == ${totalIssued} - ${totalReleased}` },
    { name: "remote supply == totalMinted - totalBurned", ok: remoteSupply === totalMinted - totalBurned, detail: `${remoteSupply} == ${totalMinted} - ${totalBurned}` },
    {
      name: "sum(lock events) == totalIssued",
      ok: issues.reduce((s, i) => s + i.shares, 0n) === totalIssued,
      detail: `${issues.length} lock events`,
    },
  ];

  return {
    status: checks.every((c) => c.ok) ? "BALANCED" : "MISMATCH",
    mezoBlock,
    baseBlock,
    baseBlockTag,
    totalLocked,
    custodyBalance,
    remoteSupply,
    pendingIssues,
    pendingIssueShares,
    pendingRedemptions,
    pendingRedemptionShares,
    pendingSettlement,
    discrepancy,
    checks,
  };
}
