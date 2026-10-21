import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { FastifyInstance, FastifyReply } from "fastify";
import { getAddress, isAddress, type PublicClient } from "viem";
import { z } from "zod";
import {
  readNativeVaultState,
  readPosition,
  readWrapperState,
  reconcile,
  reachSavingsWrapperAbi,
  reachDestinationGatewayAbi,
  reachSourceGatewayAbi,
  registry,
  integrations,
  type ReachConfig,
} from "@musd-reach/sdk";
import type { Db } from "./db.js";
import { ROOT } from "./config.js";


const toJson = (v: unknown) => JSON.parse(JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x)));

/** Tiny TTL cache with in-flight de-duplication, to protect public RPCs. */
function cached<T>(ttlMs: number, fn: () => Promise<T>) {
  let value: { at: number; v: T } | null = null;
  let inflight: Promise<T> | null = null;
  return async (): Promise<{ v: T; ageMs: number }> => {
    if (value && Date.now() - value.at < ttlMs) return { v: value.v, ageMs: Date.now() - value.at };
    if (!inflight) {
      inflight = fn()
        .then((v) => {
          value = { at: Date.now(), v };
          return v;
        })
        .finally(() => {
          inflight = null;
        });
    }
    const v = await inflight;
    return { v, ageMs: 0 };
  };
}

const notDeployed = (reply: FastifyReply) =>
  reply.code(503).send({ error: "NOT_DEPLOYED", message: "Reach contracts are not deployed on the configured networks yet." });

const amountSchema = z.string().regex(/^\d{1,78}$/, "base-unit integer string");

export function registerRoutes(
  app: FastifyInstance,
  deps: {
    db: Db;
    cfg: ReachConfig;
    clients: { mezo: PublicClient; base: PublicClient };
    startedAt: Date;
    /** "latest" only for local fork rehearsals. */
    baseFinality: "finalized" | "latest";
  },
) {
  const { db, cfg, clients } = deps;
  const d = cfg.deployment;

  const nativeState = cached(15_000, () => readNativeVaultState(clients.mezo, cfg));
  const wrapperState = cached(10_000, () => readWrapperState(clients.mezo, cfg));
  const reconciliation = cached(30_000, () => reconcile(clients, cfg, { baseBlockTag: "latest" })); // see F-13

  app.get("/health", async () => ({ ok: true, startedAt: deps.startedAt.toISOString() }));

  app.get("/ready", async (_req, reply) => {
    const jobs = await db.query("SELECT job, last_ok_at, last_error_at, last_error, consecutive_errors FROM job_runs");
    const cursors = await db.query("SELECT chain, next_block, finalized_block, updated_at FROM chain_cursor");
    const failing = jobs.rows.filter((j) => Number(j.consecutive_errors) >= 5);
    return reply.code(failing.length ? 503 : 200).send(toJson({ ready: failing.length === 0, deployed: !!d, jobs: jobs.rows, cursors: cursors.rows }));
  });

  app.get("/v1/networks", async () =>
    toJson({
      registryVersion: registry.version,
      lastVerified: registry.lastVerified,
      mezo: { ...registry.chains.mezo, musd: cfg.mezo.musd, savingsVault: cfg.mezo.savingsVault, wormholeCore: cfg.mezo.wormholeCore },
      base: { ...registry.chains.base, wormholeCore: cfg.base.wormholeCore },
      wormhole: registry.wormhole,
      reach: d ?? { status: "NOT_DEPLOYED" },
    }),
  );

  app.get("/v1/vault/native-state", async () => {
    const { v, ageMs } = await nativeState();
    return toJson({ ...v, cacheAgeMs: ageMs, source: "live eth_call on Mezo testnet" });
  });

  app.get("/v1/wrapper/assets", async (_req, reply) => {
    if (!d) return notDeployed(reply);
    const { v, ageMs } = await wrapperState();
    return toJson({ ...v, cacheAgeMs: ageMs, units: { assets: "MUSD base units (18 dp)", shares: "wSMUSD base units (18 dp)" } });
  });

  app.get("/v1/wrapper/share-price", async (_req, reply) => {
    if (!d) return notDeployed(reply);
    const { v, ageMs } = await wrapperState();
    return toJson({ assetsPerShare: v.assetsPerShare, blockNumber: v.blockNumber, blockTimestamp: v.blockTimestamp, cacheAgeMs: ageMs });
  });

  app.get("/v1/wrapper/history", async (req, reply) => {
    if (!d) return notDeployed(reply);
    const q = z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) }).parse(req.query);
    const r = await db.query("SELECT * FROM wrapper_observations ORDER BY block_number DESC LIMIT $1", [q.limit]);
    return toJson({ observations: r.rows, note: "Only real on-chain observations recorded by this indexer. No interpolation." });
  });

  app.get<{ Params: { wallet: string } }>("/v1/positions/:wallet", async (req, reply) => {
    if (!isAddress(req.params.wallet)) return reply.code(400).send({ error: "INVALID_ADDRESS" });
    const p = await readPosition(clients, cfg, getAddress(req.params.wallet));
    return toJson({ ...p, deployed: !!d, source: "live chain reads; not from the database" });
  });

  app.get("/v1/quotes/wrap", async (req, reply) => {
    if (!d) return notDeployed(reply);
    const q = z.object({ assets: amountSchema, slippageBps: z.coerce.number().int().min(0).max(500).default(0) }).parse(req.query);
    const blockNumber = await clients.mezo.getBlockNumber();
    const shares = await clients.mezo.readContract({ address: d.wrapper, abi: reachSavingsWrapperAbi, functionName: "previewDeposit", args: [BigInt(q.assets)], blockNumber });
    const paused = await clients.mezo.readContract({ address: d.wrapper, abi: reachSavingsWrapperAbi, functionName: "depositsPaused", blockNumber });
    const fee = await clients.mezo.readContract({ address: d.sourceGateway, abi: reachSourceGatewayAbi, functionName: "messageFee", blockNumber });
    return toJson({
      assets: q.assets,
      expectedShares: shares,
      minShares: (shares * BigInt(10_000 - q.slippageBps)) / 10_000n,
      wormholeMessageFee: fee,
      reachFee: "0",
      depositsPaused: paused,
      quoteBlock: blockNumber,
      validFor: "the quote block; NAV only changes when native yield accrues",
    });
  });

  app.get("/v1/quotes/unwrap", async (req, reply) => {
    if (!d) return notDeployed(reply);
    const q = z.object({ shares: amountSchema }).parse(req.query);
    const blockNumber = await clients.mezo.getBlockNumber();
    const [assets, inKind] = await Promise.all([
      clients.mezo.readContract({ address: d.wrapper, abi: reachSavingsWrapperAbi, functionName: "previewRedeem", args: [BigInt(q.shares)], blockNumber }),
      clients.mezo.readContract({ address: d.wrapper, abi: reachSavingsWrapperAbi, functionName: "previewRedeemInKind", args: [BigInt(q.shares)], blockNumber }),
    ]);
    return toJson({
      shares: q.shares,
      musd: assets,
      inKind: { smusd: inKind[0], musd: inKind[1] },
      quoteBlock: blockNumber,
      note: "MUSD exit depends on live native vault withdrawal; the in-kind exit does not.",
    });
  });

  app.get("/v1/transfers", async (req, reply) => {
    if (!d) return notDeployed(reply);
    const q = z
      .object({
        address: z.string().refine(isAddress, "invalid address").optional(),
        limit: z.coerce.number().int().min(1).max(100).default(25),
        before: z.coerce.number().int().positive().optional(),
      })
      .parse(req.query);
    const params: unknown[] = [q.limit];
    let where = "TRUE";
    if (q.address) {
      params.push(q.address.toLowerCase());
      where += ` AND (lower(sender) = $${params.length} OR lower(recipient) = $${params.length})`;
    }
    if (q.before) {
      params.push(q.before);
      where += ` AND origin_block < $${params.length}`;
    }
    const r = await db.query(`SELECT * FROM transfers WHERE ${where} ORDER BY origin_block DESC LIMIT $1`, params);
    const last = r.rows[r.rows.length - 1];
    return toJson({ transfers: r.rows, nextBefore: r.rows.length === q.limit && last ? last.origin_block : null });
  });

  app.get<{ Params: { id: string } }>("/v1/transfers/:id", async (req, reply) => {
    if (!d) return notDeployed(reply);
    if (!/^0x[0-9a-fA-F]{64}$/.test(req.params.id)) return reply.code(400).send({ error: "INVALID_TRANSFER_ID" });
    const r = await db.query("SELECT * FROM transfers WHERE transfer_id = $1", [req.params.id.toLowerCase()]);
    const row = r.rows[0];
    // Live confirmation straight from the target gateway, independent of the indexer.
    const id = req.params.id as `0x${string}`;
    const [consumedOnBase, consumedOnMezo] = await Promise.all([
      clients.base.readContract({ address: d.destinationGateway, abi: reachDestinationGatewayAbi, functionName: "transferConsumed", args: [id] }),
      clients.mezo.readContract({ address: d.sourceGateway, abi: reachSourceGatewayAbi, functionName: "transferConsumed", args: [id] }),
    ]);
    if (!row && !consumedOnBase && !consumedOnMezo) return reply.code(404).send({ error: "UNKNOWN_TRANSFER" });
    const events = await db.query("SELECT chain, event, tx_hash, block_number, finalized, args FROM chain_events WHERE transfer_id = $1 ORDER BY block_number", [
      req.params.id.toLowerCase(),
    ]);
    return toJson({ transfer: row ?? null, events: events.rows, live: { consumedOnBase, consumedOnMezo } });
  });

  app.get("/v1/backing/reconciliation", async (_req, reply) => {
    if (!d) return notDeployed(reply);
    const { v, ageMs } = await reconciliation();
    return toJson({ ...v, cacheAgeMs: ageMs, method: "Base latest read first, then Mezo latest (instant finality); events + transferConsumed for in-flight sets. See F-13." });
  });

  app.get("/v1/messaging/health", async () => {
    let wormholescan: { ok: boolean; status?: number; error?: string } = { ok: false };
    try {
      const res = await fetch(`${cfg.wormhole.api}/api/v1/health`, { signal: AbortSignal.timeout(8000) });
      wormholescan = { ok: res.ok, status: res.status };
    } catch (e) {
      wormholescan = { ok: false, error: (e as Error).message };
    }
    const pending = await db.query(
      "SELECT status, count(*)::int AS n, min(created_at) AS oldest FROM transfers WHERE status NOT IN ('BACKED_REMOTE','SHARES_RELEASED','NATIVE_REDEEMED','SHARES_CLAIMED_BY_RECIPIENT') GROUP BY status",
    );
    const jobs = await db.query("SELECT * FROM job_runs");
    return toJson({ wormholescan, pending: pending.rows, jobs: jobs.rows, deployed: !!d });
  });

  app.get("/v1/integrations", async () => toJson({ integrations }));

  const evidenceDirs = ["evidence/real-chain", "evidence/fork-rehearsal"];
  app.get("/v1/proof", async () => {
    const runs = evidenceDirs.flatMap((dir) => {
      const p = join(ROOT, dir);
      if (!existsSync(p)) return [];
      return readdirSync(p)
        .filter((f) => f.endsWith(".json"))
        .map((f) => {
          const j = JSON.parse(readFileSync(join(p, f), "utf8"));
          return { runId: j.runId ?? f.replace(/\.json$/, ""), kind: j.kind, startedAt: j.startedAt, steps: j.steps?.length ?? 0, passed: j.steps?.filter((s: { status: string }) => s.status === "PASS").length ?? 0 };
        });
    });
    return { runs };
  });

  app.get<{ Params: { runId: string } }>("/v1/proof/:runId", async (req, reply) => {
    if (!/^[\w.-]+$/.test(req.params.runId)) return reply.code(400).send({ error: "INVALID_RUN_ID" });
    for (const dir of evidenceDirs) {
      const p = join(ROOT, dir, `${req.params.runId}.json`);
      if (existsSync(p)) return JSON.parse(readFileSync(p, "utf8"));
    }
    return reply.code(404).send({ error: "UNKNOWN_RUN" });
  });
}
