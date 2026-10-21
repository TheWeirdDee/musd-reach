import { isIP } from "node:net";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
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

/**
 * Rate-limit key. By default the (proxy-validated) request IP. With CLIENT_IP_HEADER, the value an
 * edge proxy wrote into that header, for hosts such as Railway that publish no proxy address range
 * to list in TRUST_PROXY. Only a single well-formed IP is accepted; anything else falls back to the
 * socket address rather than to a client-chosen string.
 */
export function clientKey(req: FastifyRequest, header: string): string {
  if (!header) return req.ip;
  const v = req.headers[header];
  return typeof v === "string" && isIP(v.trim()) ? v.trim() : req.ip;
}

export async function registerHttpPolicy(app: FastifyInstance, env: Pick<AppEnv, "CORS_ORIGINS" | "RATE_LIMIT_PER_MINUTE"> & Partial<Pick<AppEnv, "CLIENT_IP_HEADER">>) {
  const header = env.CLIENT_IP_HEADER ?? "";
  await app.register(cors, { origin: env.CORS_ORIGINS.split(",").map((s) => s.trim()) });
  await app.register(rateLimit, { max: env.RATE_LIMIT_PER_MINUTE, timeWindow: "1 minute", keyGenerator: (req) => clientKey(req, header) });
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
