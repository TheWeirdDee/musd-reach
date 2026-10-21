import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import type { PublicClient } from "viem";
import { loadEnv, loadReachConfig } from "../src/config.js";
import { migrate, openDb, recordJob } from "../src/db.js";
import { registerRoutes } from "../src/routes.js";

// /ready must not report a deployed indexer as ready before it has indexed, or on a success
// recorded long ago (e.g. before a restart or an RPC outage).
async function setup() {
  const db = await openDb({ memory: true });
  await migrate(db);
  const cfg = loadReachConfig(loadEnv({}));
  const app = Fastify();
  registerRoutes(app, { db, cfg, clients: { mezo: {} as PublicClient, base: {} as PublicClient }, startedAt: new Date(), baseFinality: "finalized" });
  return { app, db, deployed: !!cfg.deployment };
}

describe("/ready", { timeout: 60_000 }, () => {
  it("is 503 until both indexers have succeeded, then 200", async () => {
    const { app, db, deployed } = await setup();
    expect(deployed).toBe(true);
    await recordJob(db, "relay");
    let r = await app.inject({ url: "/ready" });
    expect(r.statusCode).toBe(503);
    expect(r.json().notIndexedRecently).toEqual(["index:mezo", "index:base"]);
    await recordJob(db, "index:mezo");
    await recordJob(db, "index:base");
    r = await app.inject({ url: "/ready" });
    expect(r.statusCode).toBe(200);
    expect(r.json().ready).toBe(true);
    await app.close();
    await db.close();
  });

  it("is 503 when the last indexer success is stale", async () => {
    const { app, db } = await setup();
    await recordJob(db, "index:mezo");
    await recordJob(db, "index:base");
    await db.query("UPDATE job_runs SET last_ok_at = now() - interval '11 minutes' WHERE job = 'index:base'");
    const r = await app.inject({ url: "/ready" });
    expect(r.statusCode).toBe(503);
    expect(r.json().notIndexedRecently).toEqual(["index:base"]);
    await app.close();
    await db.close();
  });
});
