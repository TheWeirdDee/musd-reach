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
  BASE_SEPOLIA_RPC: z.string().default("https://sepolia.base.org"),
  BASE_SEPOLIA_RPC_FALLBACK: z.string().optional(),
  REACH_DEPLOYMENTS: z.string().default(join(ROOT, "deployments/testnet.json")),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
  INDEX_INTERVAL_MS: z.coerce.number().int().min(2000).default(12_000),
  RELAYER_KEY_FILE: z.string().optional(),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(120),
});

export type AppEnv = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  const parsed = schema.safeParse(source);
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
