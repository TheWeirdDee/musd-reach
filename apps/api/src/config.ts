import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { buildConfig, type ReachConfig } from "@musd-reach/sdk";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

const schema = z.object({
  ROLE: z.enum(["api", "worker", "all"]).default("all"),
  API_PORT: z.coerce.number().int().positive().default(8787),
  API_HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string().optional(),
  PGLITE_DIR: z.string().default(join(ROOT, "apps/api/.data/pglite")),
  MEZO_TESTNET_RPC: z.string().default("https://rpc.test.mezo.org"),
  MEZO_TESTNET_RPC_FALLBACK: z.string().optional(),
  // publicnode first: sepolia.base.org rejects eth_getLogs ranges above ~200 blocks (F-12/F-15).
  BASE_SEPOLIA_RPC: z.string().default("https://base-sepolia-rpc.publicnode.com"),
  BASE_SEPOLIA_RPC_FALLBACK: z.string().default("https://sepolia.base.org"),
  REACH_DEPLOYMENTS: z.string().default(join(ROOT, "deployments/testnet.json")),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
  INDEX_INTERVAL_MS: z.coerce.number().int().min(2000).default(12_000),
  RELAYER_KEY_FILE: z.string().optional(),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(120),
  // Comma-separated addresses/CIDRs of the reverse proxies in front of the API whose
  // X-Forwarded-For entry is trusted. Empty: the socket address is the client (F-18).
  TRUST_PROXY: z.string().default(""),
  // A header that the platform's edge *overwrites* with the connecting client's IP (Railway:
  // "x-real-ip"). Used only as the rate-limit key. Leave empty unless the host documents that its
  // edge sets it and the API is reachable only through that edge; verify with
  // scripts/check-rate-limit.mjs against the hosted URL (docs/DEPLOYMENT.md).
  CLIENT_IP_HEADER: z
    .string()
    .regex(/^[a-z0-9-]*$/, "lowercase header name")
    .default(""),
}).refine((e) => !(e.TRUST_PROXY && e.CLIENT_IP_HEADER), { message: "Set TRUST_PROXY or CLIENT_IP_HEADER, not both", path: ["CLIENT_IP_HEADER"] });

export type AppEnv = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  // An empty variable (e.g. copied from .env.example) means "unset", so defaults apply.
  const set = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== undefined && v !== ""));
  // Platforms such as Railway route to the PORT they inject; an explicit API_PORT still wins.
  const parsed = schema.safeParse({ ...set, API_PORT: set.API_PORT ?? set.PORT });
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  }
  return parsed.data;
}

export function loadReachConfig(env: AppEnv): ReachConfig {
  const deployments = existsSync(env.REACH_DEPLOYMENTS) ? JSON.parse(readFileSync(env.REACH_DEPLOYMENTS, "utf8")) : null;
  return buildConfig({
    deployments,
    mezoRpcUrls: [env.MEZO_TESTNET_RPC, env.MEZO_TESTNET_RPC_FALLBACK ?? ""],
    baseRpcUrls: [env.BASE_SEPOLIA_RPC, env.BASE_SEPOLIA_RPC_FALLBACK ?? ""],
  });
}
