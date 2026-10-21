import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import type { PublicClient } from "viem";
import { loadEnv, loadReachConfig } from "../src/config.js";
import { migrate, openDb, recordJob } from "../src/db.js";
import { registerRoutes } from "../src/routes.js";
import { registerHttpPolicy } from "../src/http.js";

// /ready must not report a deployed indexer as ready before it has indexed, or on a success
// recorded long ago (e.g. before a restart or an RPC outage).
async function setup() {
  const db = await openDb({ memory: true });
  await migrate(db);
  const cfg = loadReachConfig(loadEnv({}));
  const app = Fastify();
  await registerHttpPolicy(app, { CORS_ORIGINS: "http://localhost:3000", RATE_LIMIT_PER_MINUTE: 1000 });
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

describe("amount validation", { timeout: 60_000 }, () => {
  it("rejects amounts above uint256 as 400 before any chain read", async () => {
    const { app, db } = await setup();
    const r = await app.inject({ url: `/v1/quotes/wrap?assets=${2n ** 256n}` });
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toBe("INVALID_REQUEST");
    await app.close();
    await db.close();
  });
});
