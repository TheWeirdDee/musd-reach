import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Fastify from "fastify";
import type { PublicClient } from "viem";
import { loadEnv, loadReachConfig } from "../src/config.js";
import { migrate, openDb, type Db } from "../src/db.js";
import { INDEX_WINDOW, deriveTransfers, indexChainOnce } from "../src/indexer.js";
import { registerHttpPolicy } from "../src/http.js";
import { registerRoutes } from "../src/routes.js";

// A scripted chain: blocks have hashes and timestamps, logs live in blocks, and a reorg replaces
// a block's hash and contents. Only the client calls the indexer makes are implemented.
type FakeLog = { blockNumber: bigint; txHash: string; logIndex: number; eventName: string; args: Record<string, unknown> };
class FakeChain {
  head = 0n;
  finalized = 0n;
  hashes = new Map<bigint, string>();
  times = new Map<bigint, bigint>();
  logs: FakeLog[] = [];
  getLogsCalls = 0;
  mine(n: bigint, time: bigint, fork = "a") {
    this.hashes.set(n, `0x${fork}${n.toString(16).padStart(63, "0")}`);
    this.times.set(n, time);
    if (n > this.head) this.head = n;
  }
  reorg(n: bigint) {
    this.mine(n, this.times.get(n) ?? 0n, "b");
    this.logs = this.logs.filter((l) => l.blockNumber !== n);
  }
  client(): PublicClient {
    return {
      getBlockNumber: async () => this.head,
      getBlock: async (q: { blockNumber?: bigint; blockTag?: string }) => {
        if (q.blockTag === "finalized") return { number: this.finalized, hash: this.hashes.get(this.finalized), timestamp: this.times.get(this.finalized) ?? 0n };
        const n = q.blockNumber!;
        if (!this.hashes.has(n)) throw new Error("unknown block");
        return { number: n, hash: this.hashes.get(n), timestamp: this.times.get(n) };
      },
      getLogs: async (q: { fromBlock: bigint; toBlock: bigint }) => {
        this.getLogsCalls++;
        return this.logs
          .filter((l) => l.blockNumber >= q.fromBlock && l.blockNumber <= q.toBlock)
          .map((l) => ({
            blockNumber: l.blockNumber,
            blockHash: this.hashes.get(l.blockNumber),
            transactionHash: l.txHash,
            logIndex: l.logIndex,
            address: "0x50436eb8f8213c7df773f2c331bb41e1fecb5a23",
            eventName: l.eventName,
            args: l.args,
          }));
      },
    } as unknown as PublicClient;
  }
}

const ID = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;
const ADDR = (n: number) => `0x${n.toString(16).padStart(40, "0")}`;
const burn = (id: number, holder: number, shares: bigint, seq: bigint) => ({
  eventName: "ReceiptBurned",
  args: { transferId: ID(id), holder: ADDR(holder), recipient: ADDR(holder), shares, mode: 1, sequence: seq, nonce: seq },
});
const lock = (id: number, sender: number, shares: bigint, seq: bigint) => ({
  eventName: "SharesLocked",
  args: { transferId: ID(id), sender: ADDR(sender), recipient: ADDR(sender), shares, sequence: seq, nonce: seq },
});

function spec(chain: "mezo" | "base", c: FakeChain, startBlock = 1n) {
  return { chain, client: c.client(), addresses: [], events: [], startBlock, batch: INDEX_WINDOW[chain], finalityTag: chain === "mezo" ? ("latest" as const) : ("finalized" as const) };
}

let db: Db;
// PGlite by default; set TEST_DATABASE_URL to run the same tests on a real PostgreSQL (the schema
// is dropped and recreated before each test, so never point it at a database you care about).
const pgUrl = process.env.TEST_DATABASE_URL;
beforeEach(async () => {
  db = await openDb(pgUrl ? { databaseUrl: pgUrl } : { memory: true });
  if (pgUrl) await db.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
  await migrate(db);
});
afterEach(async () => {
  await db.close();
});

async function transfers() {
  return (await db.query<{ transfer_id: string; origin_tx: string; origin_block: number; sender: string; shares: string; wormhole_sequence: string; vaa_digest: string | null }>(
    "SELECT * FROM transfers ORDER BY transfer_id",
  )).rows;
}

describe("indexer reorg recovery", { timeout: 60_000 }, () => {
  it("backfills block times when upgrading an existing indexed database", async () => {
    const base = new FakeChain();
    for (let n = 1n; n <= 10n; n++) base.mine(n, 1_000n + n);
    base.finalized = 10n;
    base.logs.push({ blockNumber: 8n, txHash: "0xaa", logIndex: 0, ...burn(1, 7, 5n, 1n) });
    await indexChainOnce(db, spec("base", base));
    await deriveTransfers(db);
    // Model rows created before the timestamp migration, with the cursor already past them.
    await db.query("UPDATE chain_events SET block_time = NULL");
    await db.query("UPDATE transfers SET origin_time = NULL");
    await db.query("DELETE FROM schema_migrations WHERE name = '002_origin_time.sql'");
    await migrate(db);
    const cursor = await db.query<{ next_block: string }>("SELECT next_block FROM chain_cursor WHERE chain = 'base'");
    expect(BigInt(cursor.rows[0]!.next_block)).toBe(8n);
    await indexChainOnce(db, spec("base", base));
    await deriveTransfers(db);
    const restored = await db.query<{ seconds: string }>("SELECT EXTRACT(EPOCH FROM origin_time) AS seconds FROM transfers");
    expect(Number(restored.rows[0]!.seconds)).toBe(1008);
  });

  it("removes a transfer whose origin event was reorged away", async () => {
    const base = new FakeChain();
    for (let n = 1n; n <= 10n; n++) base.mine(n, 1_000n + n);
    base.logs.push({ blockNumber: 8n, txHash: "0xaa", logIndex: 0, ...burn(1, 7, 5n, 1n) });
    base.finalized = 5n;
    await indexChainOnce(db, spec("base", base));
    await deriveTransfers(db);
    expect((await transfers()).map((t) => t.transfer_id)).toEqual([ID(1)]);

    base.reorg(8n); // the burn never happened on the canonical chain
    base.mine(11n, 1_011n);
    await indexChainOnce(db, spec("base", base));
    await deriveTransfers(db);
    expect(await transfers()).toEqual([]);
  });

  it("re-points a re-included transfer id at its new origin transaction and drops the stale digest", async () => {
    const base = new FakeChain();
    for (let n = 1n; n <= 10n; n++) base.mine(n, 1_000n + n);
    base.logs.push({ blockNumber: 8n, txHash: "0xaa", logIndex: 0, ...burn(1, 7, 5n, 1n) });
    base.finalized = 5n;
    await indexChainOnce(db, spec("base", base));
    await deriveTransfers(db);
    await db.query("UPDATE transfers SET vaa_digest = '0xstale' WHERE transfer_id = $1", [ID(1)]);

    // After the reorg a different holder's burn takes the same nonce, so the same transfer id.
    base.reorg(8n);
    base.mine(11n, 1_011n);
    base.mine(12n, 1_012n);
    base.logs.push({ blockNumber: 12n, txHash: "0xbb", logIndex: 3, ...burn(1, 9, 8n, 2n) });
    await indexChainOnce(db, spec("base", base));
    await deriveTransfers(db);
    const [t] = await transfers();
    expect(t).toMatchObject({ origin_tx: "0xbb", origin_block: 12, sender: ADDR(9), shares: "8", wormhole_sequence: "2", vaa_digest: null });
  });

  it("preserves the rewind when replacement log fetching fails before a restart", async () => {
    const base = new FakeChain();
    for (let n = 1n; n <= 10n; n++) base.mine(n, 1_000n + n);
    base.finalized = 5n;
    base.logs.push({ blockNumber: 8n, txHash: "0xaa", logIndex: 0, ...burn(1, 7, 5n, 1n) });
    await indexChainOnce(db, spec("base", base));
    await deriveTransfers(db);
    base.reorg(8n);
    base.logs.push({ blockNumber: 8n, txHash: "0xbb", logIndex: 0, ...burn(2, 7, 5n, 2n) });
    const failing = spec("base", base);
    failing.client = { ...failing.client, getLogs: async () => { throw new Error("RPC unavailable"); } } as unknown as PublicClient;
    await expect(indexChainOnce(db, failing)).rejects.toThrow("RPC unavailable");
    // The old rows are gone, so only the persisted cursor can recover this block now.
    await indexChainOnce(db, spec("base", base));
    await deriveTransfers(db);
    expect((await transfers()).map((t) => t.transfer_id)).toEqual([ID(2)]);
  });

  it("catches up a long gap in one tick instead of 1,500 blocks at a time", async () => {
    const base = new FakeChain();
    for (const n of [1n, 400_000n, 800_000n]) base.mine(n, 1_000n + n);
    base.head = 800_000n;
    base.finalized = 800_000n;
    base.logs.push({ blockNumber: 400_000n, txHash: "0xaa", logIndex: 0, ...burn(1, 7, 5n, 1n) });
    await indexChainOnce(db, spec("base", base));
    const cur = await db.query<{ next_block: string }>("SELECT next_block FROM chain_cursor WHERE chain = 'base'");
    expect(BigInt(cur.rows[0]!.next_block)).toBe(800_001n);
    expect(base.getLogsCalls).toBeLessThanOrEqual(20);
  });
});

describe("transfer pagination", { timeout: 60_000 }, () => {
  async function api() {
    const cfg = loadReachConfig(loadEnv({}));
    const app = Fastify();
    await registerHttpPolicy(app, { CORS_ORIGINS: "http://localhost:3000", RATE_LIMIT_PER_MINUTE: 1000 });
    registerRoutes(app, { db, cfg, clients: { mezo: {} as PublicClient, base: {} as PublicClient }, startedAt: new Date(), baseFinality: "finalized" });
    return app;
  }

  it("walks every transfer exactly once, even when a page ends inside a block", async () => {
    const base = new FakeChain();
    for (let n = 1n; n <= 20n; n++) base.mine(n, 1_000n + n);
    base.finalized = 20n;
    // Five transfers, three of them in block 10.
    base.logs.push({ blockNumber: 5n, txHash: "0x01", logIndex: 0, ...burn(1, 7, 1n, 1n) });
    for (const [i, id] of [2, 3, 4].entries()) base.logs.push({ blockNumber: 10n, txHash: `0x1${i}`, logIndex: i, ...burn(id, 7, 1n, BigInt(id)) });
    base.logs.push({ blockNumber: 15n, txHash: "0x05", logIndex: 0, ...burn(5, 7, 1n, 5n) });
    await indexChainOnce(db, spec("base", base));
    await deriveTransfers(db);

    const app = await api();
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 10; page++) {
      const r = await app.inject({ url: `/v1/transfers?limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}` });
      expect(r.statusCode).toBe(200);
      const body = r.json() as { transfers: { transfer_id: string }[]; nextCursor: string | null };
      seen.push(...body.transfers.map((t) => t.transfer_id));
      cursor = body.nextCursor;
      if (!cursor) break;
    }
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5].map(ID).sort());
    expect(new Set(seen).size).toBe(5);
    await app.close();
  });

  it("orders transfers from both chains by when they happened, not by raw block number", async () => {
    // Mezo block numbers (~16M) are far below Base's (~49M); a Mezo lock that happened later must
    // still list first.
    const mezo = new FakeChain();
    const base = new FakeChain();
    mezo.mine(16_000_000n, 2_000n); // later in time
    base.mine(49_000_000n, 1_000n); // earlier in time
    base.finalized = 49_000_000n;
    mezo.logs.push({ blockNumber: 16_000_000n, txHash: "0xm1", logIndex: 0, ...lock(1, 7, 1n, 1n) });
    base.logs.push({ blockNumber: 49_000_000n, txHash: "0xb1", logIndex: 0, ...burn(2, 7, 1n, 1n) });
    await indexChainOnce(db, spec("mezo", mezo, 16_000_000n));
    await indexChainOnce(db, spec("base", base, 49_000_000n));
    await deriveTransfers(db);
    const app = await api();
    const r = await app.inject({ url: "/v1/transfers?limit=10" });
    expect((r.json() as { transfers: { transfer_id: string }[] }).transfers.map((t) => t.transfer_id)).toEqual([ID(1), ID(2)]);
    await app.close();
  });

  it("validates filters and applies direction and status before pagination", async () => {
    const mezo = new FakeChain();
    const base = new FakeChain();
    mezo.mine(10n, 2_000n);
    base.mine(10n, 1_000n);
    base.finalized = 10n;
    mezo.logs.push({ blockNumber: 10n, txHash: "0xm1", logIndex: 0, ...lock(1, 7, 1n, 1n) });
    base.logs.push({ blockNumber: 10n, txHash: "0xb1", logIndex: 0, ...burn(2, 7, 1n, 1n) });
    await indexChainOnce(db, spec("mezo", mezo));
    await indexChainOnce(db, spec("base", base));
    await deriveTransfers(db);
    const app = await api();
    const filtered = await app.inject({ url: "/v1/transfers?direction=REDEEM&limit=1" });
    expect(filtered.json().transfers.map((t: { transfer_id: string }) => t.transfer_id)).toEqual([ID(2)]);
    const status = filtered.json().transfers[0].status;
    const combined = await app.inject({ url: `/v1/transfers?direction=ISSUE&status=${status}` });
    expect(combined.json().transfers).toEqual([]);
    expect((await app.inject({ url: "/v1/transfers?direction=INVALID" })).statusCode).toBe(400);
    expect((await app.inject({ url: "/v1/transfers?status=INVALID" })).statusCode).toBe(400);
    const version = await app.inject({ url: "/v1/version" });
    expect(version.statusCode).toBe(200);
    expect(version.json().version).toBe("0.1.0");
    await app.close();
  });
});
