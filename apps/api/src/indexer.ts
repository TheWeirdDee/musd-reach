import { parseAbiItem, type AbiEvent, type Address, type PublicClient } from "viem";
import { fetchAdaptive, reachEvents, type ReachConfig } from "@musd-reach/sdk";
import type { Db } from "./db.js";

const messageConsumed = parseAbiItem("event MessageConsumed(bytes32 indexed transferId, bytes32 indexed vaaDigest, uint8 direction)");
const navUpdated = parseAbiItem("event NavUpdated(uint256 assets, uint256 supply, uint64 timestamp, uint64 blockNumber)");
const wrapperDeposit = parseAbiItem("event Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares)");
const wrapperWithdraw = parseAbiItem(
  "event Withdraw(address indexed sender, address indexed receiver, address indexed owner, uint256 assets, uint256 shares)",
);
const savingsDeposited = parseAbiItem("event SavingsDeposited(address indexed caller, address indexed receiver, uint256 smusdAmount, uint256 shares)");
const redeemedInKind = parseAbiItem(
  "event RedeemedInKind(address indexed caller, address indexed receiver, address indexed owner, uint256 shares, uint256 smusdOut, uint256 musdOut)",
);
const harvested = parseAbiItem("event Harvested(uint256 claimed, uint256 idleAfter)");

export type ChainName = "mezo" | "base";

type Spec = {
  chain: ChainName;
  client: PublicClient;
  addresses: Address[];
  events: AbiEvent[];
  startBlock: bigint;
  batch: bigint;
  /** "latest" is only for local fork rehearsals, where "finalized" is the fork origin. */
  finalityTag: "finalized" | "latest";
};

export function indexerSpecs(
  cfg: ReachConfig,
  clients: { mezo: PublicClient; base: PublicClient },
  baseFinalityTag: "finalized" | "latest" = "finalized",
): Spec[] {
  const d = cfg.deployment;
  if (!d) return [];
  return [
    {
      chain: "mezo",
      client: clients.mezo,
      addresses: [d.sourceGateway, d.wrapper],
      events: [
        reachEvents.sharesLocked,
        reachEvents.sharesReleased,
        reachEvents.redeemedToMusd,
        reachEvents.settlementPending,
        reachEvents.pendingSharesClaimed,
        reachEvents.navPublished,
        messageConsumed,
        wrapperDeposit,
        wrapperWithdraw,
        savingsDeposited,
        redeemedInKind,
        harvested,
      ] as AbiEvent[],
      startBlock: d.wrapperDeployBlock,
      batch: 5_000n,
      finalityTag: "latest",
    },
    {
      chain: "base",
      client: clients.base,
      addresses: [d.destinationGateway],
      events: [reachEvents.receiptMinted, reachEvents.receiptBurned, navUpdated, messageConsumed] as AbiEvent[],
      startBlock: d.destinationDeployBlock,
      batch: 1_500n,
      finalityTag: baseFinalityTag,
    },
  ];
}

const json = (v: unknown) => JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x));

async function finalizedBlock(spec: Spec, head: bigint): Promise<bigint> {
  // Mezo (CometBFT) has instant finality: latest is final. Base uses the L2 `finalized` tag.
  if (spec.chain === "mezo" || spec.finalityTag === "latest") return head;
  const b = await spec.client.getBlock({ blockTag: "finalized" });
  return b.number;
}

/**
 * One idempotent indexing step for a chain. Safe to run concurrently with restarts: all writes
 * are upserts keyed by (chain, tx_hash, log_index), and the cursor only advances after a batch
 * is stored. Unfinalized rows are re-checked against the canonical block hash every tick; on a
 * mismatch they are deleted and the cursor rewinds (reorg handling).
 */
export async function indexChainOnce(db: Db, spec: Spec): Promise<{ from: bigint; to: bigint; stored: number; reorgedFrom?: bigint }> {
  const cur = await db.query<{ next_block: string }>("SELECT next_block FROM chain_cursor WHERE chain = $1", [spec.chain]);
  let next = cur.rows[0] ? BigInt(cur.rows[0].next_block) : spec.startBlock;
  if (!cur.rows[0]) {
    await db.query("INSERT INTO chain_cursor (chain, next_block) VALUES ($1, $2) ON CONFLICT DO NOTHING", [spec.chain, next.toString()]);
  }
  const head = await spec.client.getBlockNumber();
  const finalized = await finalizedBlock(spec, head);

  // Reorg check over unfinalized rows.
  let reorgedFrom: bigint | undefined;
  const unfinal = await db.query<{ block_number: string; block_hash: string }>(
    "SELECT DISTINCT block_number, block_hash FROM chain_events WHERE chain = $1 AND finalized = FALSE ORDER BY block_number",
    [spec.chain],
  );
  for (const r of unfinal.rows) {
    const bn = BigInt(r.block_number);
    const blk = await spec.client.getBlock({ blockNumber: bn }).catch(() => null);
    if (!blk || blk.hash !== r.block_hash) {
      reorgedFrom = bn;
      await db.query("DELETE FROM chain_events WHERE chain = $1 AND block_number >= $2", [spec.chain, bn.toString()]);
      if (bn < next) next = bn;
      break;
    }
  }
  await db.query("UPDATE chain_events SET finalized = TRUE WHERE chain = $1 AND finalized = FALSE AND block_number <= $2", [
    spec.chain,
    finalized.toString(),
  ]);

  if (next > head) {
    await db.query("UPDATE chain_cursor SET next_block = $2, finalized_block = $3, updated_at = now() WHERE chain = $1", [
      spec.chain,
      next.toString(),
      finalized.toString(),
    ]);
    return { from: next, to: head, stored: 0, reorgedFrom };
  }
  const to = next + spec.batch > head ? head : next + spec.batch;
  // Splits the window when an RPC rejects its size (e.g. HTTP 413), instead of failing the job.
  const logs = await fetchAdaptive(
    (fromBlock, toBlock) => spec.client.getLogs({ address: spec.addresses, events: spec.events, fromBlock, toBlock, strict: true }),
    next,
    to,
  );

  for (const l of logs) {
    const args = (l as unknown as { args: Record<string, unknown> }).args;
    const transferId = typeof args.transferId === "string" ? args.transferId : null;
    await db.query(
      `INSERT INTO chain_events (chain, block_number, block_hash, tx_hash, log_index, contract, event, transfer_id, args, finalized)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (chain, tx_hash, log_index) DO UPDATE SET block_hash = EXCLUDED.block_hash, block_number = EXCLUDED.block_number,
         finalized = EXCLUDED.finalized`,
      [
        spec.chain,
        l.blockNumber!.toString(),
        l.blockHash,
        l.transactionHash,
        l.logIndex,
        l.address.toLowerCase(),
        (l as unknown as { eventName: string }).eventName,
        transferId,
        json(args),
        l.blockNumber! <= finalized,
      ],
    );
  }
  await db.query("UPDATE chain_cursor SET next_block = $2, finalized_block = $3, updated_at = now() WHERE chain = $1", [
    spec.chain,
    (to + 1n).toString(),
    finalized.toString(),
  ]);
  return { from: next, to, stored: logs.length, reorgedFrom };
}

type EventRow = { chain: ChainName; event: string; tx_hash: string; block_number: string; finalized: boolean; args: Record<string, string> };

/**
 * Rebuilds transfer status rows from indexed events. Idempotent; derives everything from logs.
 * Status vocabulary follows the PRD claim lifecycle; nothing is "complete" until the target-side
 * event exists, and final states require target finality.
 */
export async function deriveTransfers(db: Db): Promise<number> {
  const rows = await db.query<EventRow & { transfer_id: string }>(
    "SELECT chain, event, tx_hash, block_number, finalized, args, transfer_id FROM chain_events WHERE transfer_id IS NOT NULL ORDER BY block_number, log_index",
  );
  const by = new Map<string, EventRow[]>();
  for (const r of rows.rows) {
    const list = by.get(r.transfer_id) ?? [];
    list.push({ ...r, args: typeof r.args === "string" ? JSON.parse(r.args) : r.args });
    by.set(r.transfer_id, list);
  }
  let n = 0;
  for (const [id, evs] of by) {
    const lock = evs.find((e) => e.event === "SharesLocked");
    const burn = evs.find((e) => e.event === "ReceiptBurned");
    const origin = lock ?? burn;
    if (!origin) continue; // NAV messages or consumption seen before origin indexed
    const direction = lock ? "ISSUE" : "REDEEM";
    const target = lock
      ? evs.find((e) => e.event === "ReceiptMinted")
      : evs.find((e) => e.event === "SharesReleased") ?? evs.find((e) => e.event === "RedeemedToMusd");
    const redeemed = evs.find((e) => e.event === "RedeemedToMusd");
    const pending = !!evs.find((e) => e.event === "SettlementPending");
    const claimedShares = !!evs.find((e) => e.event === "PendingSettlementSharesClaimed");
    const consumed = evs.find((e) => e.event === "MessageConsumed");

    let status: string;
    if (direction === "ISSUE") {
      status = target ? (target.finalized ? "BACKED_REMOTE" : "REMOTE_MINT_PENDING_FINALITY") : "SOURCE_LOCKED";
    } else if (!target && pending && consumed) {
      // Delivered and verified, but the MUSD settlement could not complete yet. Shares are held
      // in custody for the recipient; anyone may retry, only the recipient may take shares.
      status = "SETTLEMENT_PENDING";
    } else if (!target) {
      status = origin.finalized ? "REMOTE_BURN_FINALIZED" : "REMOTE_BURN_PENDING";
    } else if (redeemed) {
      status = "NATIVE_REDEEMED";
    } else if (claimedShares) {
      // The recipient chose shares after a failed MUSD settlement (only they can).
      status = "SHARES_CLAIMED_BY_RECIPIENT";
    } else {
      status = "SHARES_RELEASED";
    }

    await db.query(
      `INSERT INTO transfers (transfer_id, direction, status, shares, sender, recipient, redeem_mode, wormhole_sequence,
         origin_tx, origin_block, origin_finalized, target_tx, target_block, target_finalized, vaa_digest, musd_out, fell_back, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17, now())
       ON CONFLICT (transfer_id) DO UPDATE SET
         status = CASE WHEN EXCLUDED.status IN ('SOURCE_LOCKED', 'REMOTE_BURN_FINALIZED') AND transfers.vaa_digest IS NOT NULL
                       THEN 'VAA_SIGNED' ELSE EXCLUDED.status END,
         origin_finalized = EXCLUDED.origin_finalized,
         target_tx = EXCLUDED.target_tx, target_block = EXCLUDED.target_block, target_finalized = EXCLUDED.target_finalized,
         vaa_digest = COALESCE(EXCLUDED.vaa_digest, transfers.vaa_digest), musd_out = EXCLUDED.musd_out, fell_back = EXCLUDED.fell_back,
         updated_at = now()`,
      [
        id,
        direction,
        status,
        origin.args.shares,
        lock ? lock.args.sender : burn!.args.holder,
        origin.args.recipient,
        burn ? Number(burn.args.mode) : null,
        origin.args.sequence,
        origin.tx_hash,
        origin.block_number,
        origin.finalized,
        target?.tx_hash ?? null,
        target?.block_number ?? null,
        target ? target.finalized : null,
        consumed?.args.vaaDigest ?? null,
        redeemed?.args.assets ?? null,
        pending,
      ],
    );
    n++;
  }
  return n;
}
