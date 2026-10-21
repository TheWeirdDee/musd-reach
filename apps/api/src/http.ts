import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { ZodError } from "zod";
import type { AppEnv } from "./config.js";

/**
 * Fastify instance with the public HTTP policy: CORS, rate limiting and error mapping.
 *
 * Client IPs: `trustProxy: true` would take the leftmost X-Forwarded-For entry, which the client
 * writes, so rotating it would give every request a fresh rate-limit bucket (F-18). Only the
 * listed proxy addresses are trusted; with none the socket address is the client. (Fastify treats a
 * bare hop count as "trust nothing", because it cannot validate the immediate peer.)
 */
export function createHttpServer(env: Pick<AppEnv, "TRUST_PROXY">): FastifyInstance {
  const proxies = env.TRUST_PROXY.split(",").map((s) => s.trim()).filter(Boolean);
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? "info", redact: ["req.headers.authorization"] },
    trustProxy: proxies.length ? proxies : false,
  });
  return app;
}

export async function registerHttpPolicy(app: FastifyInstance, env: Pick<AppEnv, "CORS_ORIGINS" | "RATE_LIMIT_PER_MINUTE">) {
  await app.register(cors, { origin: env.CORS_ORIGINS.split(",").map((s) => s.trim()) });
  await app.register(rateLimit, { max: env.RATE_LIMIT_PER_MINUTE, timeWindow: "1 minute" });
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) return reply.code(400).send({ error: "INVALID_REQUEST", issues: err.issues });
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    const e = err as Error & { shortMessage?: string };
    if (status >= 500) {
      // Upstream RPC or database failures surface as 502 with an honest but generic message, never
      // stale fabricated data. Internal detail (SQL, RPC endpoints) stays in the server log (F-18).
      app.log.error({ err: e.shortMessage ?? String(e.message).split("\n")[0] }, "request failed");
      return reply.code(502).send({ error: "UPSTREAM_UNAVAILABLE", message: "A live chain or database read failed. Retry shortly." });
    }
    return reply.code(status).send({ error: e.name, message: String(e.message).split("\n")[0] });
  });
}
