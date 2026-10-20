import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { ZodError } from "zod";
import { createReachClients, readWrapperState, reconcile } from "@musd-reach/sdk";
import { loadEnv, loadReachConfig } from "./config.js";
import { openDb, migrate, recordJob, type Db } from "./db.js";
import { indexChainOnce, indexerSpecs, deriveTransfers } from "./indexer.js";
import { trackAndRelay } from "./relay.js";
import { registerRoutes } from "./routes.js";

const env = loadEnv();
const cfg = loadReachConfig(env);
const clients = createReachClients(cfg);
const startedAt = new Date();

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL ?? "info", redact: ["req.headers.authorization"] },
  trustProxy: true,
});

/** Runs `fn` forever with exponential backoff on failure; records health in job_runs. */
function loop(db: Db, name: string, intervalMs: number, fn: () => Promise<unknown>) {
  let delay = intervalMs;
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    try {
      const r = await fn();
      await recordJob(db, name);
      if (r) app.log.debug({ job: name, result: r }, "job ok");
      delay = intervalMs;
    } catch (e) {
      app.log.warn({ job: name, err: (e as Error).message.split("\n")[0] }, "job failed");
      await recordJob(db, name, e).catch(() => {});
      delay = Math.min(delay * 2, 5 * 60_000);
    }
    setTimeout(tick, delay);
  };
  setTimeout(tick, 500);
  return () => {
    stopped = true;
  };
}

async function main() {
  const db = await openDb({ databaseUrl: env.DATABASE_URL, pgliteDir: env.PGLITE_DIR });
  const applied = await migrate(db);
  app.log.info({ db: db.kind, applied, deployed: !!cfg.deployment }, "database ready");

  const stops: (() => void)[] = [];
  if (env.ROLE !== "api") {
    if (!cfg.deployment) {
      app.log.warn("No Reach deployment recorded; indexer idle. Chain-level endpoints still serve live reads.");
    } else {
      const baseFinality = process.env.INDEXER_BASE_FINALITY === "latest" ? "latest" : "finalized";
      for (const spec of indexerSpecs(cfg, clients, baseFinality)) {
        stops.push(
          loop(db, `index:${spec.chain}`, env.INDEX_INTERVAL_MS, async () => {
            const r = await indexChainOnce(db, spec);
            if (r.reorgedFrom !== undefined) app.log.warn({ chain: spec.chain, from: r.reorgedFrom }, "reorg detected; rewound");
            await deriveTransfers(db);
            return r;
          }),
        );
      }
      stops.push(
        loop(db, "observe:wrapper", 60_000, async () => {
          const w = await readWrapperState(clients.mezo, cfg);
          await db.query(
            `INSERT INTO wrapper_observations (block_number, block_timestamp, total_assets, total_supply, principal, idle, pending_yield, assets_per_share)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (block_number) DO NOTHING`,
            [w.blockNumber, w.blockTimestamp, w.totalAssets, w.totalSupply, w.principal, w.idle, w.pendingYield, w.assetsPerShare].map(String),
          );
        }),
      );
      stops.push(
        loop(db, "reconcile", 120_000, async () => {
          const r = await reconcile(clients, cfg, { baseBlockTag: baseFinality });
          await db.query(
            `INSERT INTO reconciliation_snapshots (status, mezo_block, base_block, total_locked, remote_supply, pending_issue, pending_redeem, discrepancy)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [r.status, r.mezoBlock, r.baseFinalizedBlock, r.totalLocked, r.remoteSupply, r.pendingIssueShares, r.pendingRedemptionShares, r.discrepancy].map(String),
          );
          if (r.status !== "BALANCED") app.log.error({ reconciliation: r.checks }, "RECONCILIATION MISMATCH");
        }),
      );
      stops.push(loop(db, "relay", 20_000, () => trackAndRelay(db, cfg, clients, env.RELAYER_KEY_FILE, (m, x) => app.log.info(x, m))));
    }
  }

  if (env.ROLE !== "worker") {
    await app.register(cors, { origin: env.CORS_ORIGINS.split(",").map((s) => s.trim()) });
    await app.register(rateLimit, { max: env.RATE_LIMIT_PER_MINUTE, timeWindow: "1 minute" });
    app.setErrorHandler((err, _req, reply) => {
      if (err instanceof ZodError) return reply.code(400).send({ error: "INVALID_REQUEST", issues: err.issues });
      const status = (err as { statusCode?: number }).statusCode ?? 500;
      // Upstream RPC failures surface as 502 with an honest message, never stale fabricated data.
      const e = err as Error & { shortMessage?: string };
      if (status >= 500) app.log.error({ err: e.shortMessage ?? String(e.message).split("\n")[0] }, "request failed");
      return reply
        .code(status === 500 ? 502 : status)
        .send({ error: status === 500 ? "UPSTREAM_UNAVAILABLE" : e.name, message: String(e.message).split("\n")[0] });
    });
    registerRoutes(app, { db, cfg, clients, startedAt, baseFinality: process.env.INDEXER_BASE_FINALITY === "latest" ? "latest" : "finalized" });
    await app.listen({ port: env.API_PORT, host: env.API_HOST });
  }

  const shutdown = async () => {
    stops.forEach((s) => s());
    await app.close().catch(() => {});
    await db.close().catch(() => {});
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((e) => {
  app.log.fatal(e);
  process.exit(1);
});
