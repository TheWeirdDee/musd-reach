import { buildConfig, type ReachConfig } from "@musd-reach/sdk";
import siteData from "@/generated/site-data.json";

/**
 * Runtime configuration. The deployment comes from deployments/testnet.json (synced at build).
 * NEXT_PUBLIC_REACH_DEPLOYMENT may override it for local fork rehearsals only; production builds
 * must use the recorded public deployment.
 */
function deploymentSource(): Record<string, unknown> | null {
  const override = process.env.NEXT_PUBLIC_REACH_DEPLOYMENT;
  if (override) {
    try {
      return JSON.parse(override);
    } catch {
      return null;
    }
  }
  return (siteData.deployment as Record<string, unknown> | null) ?? null;
}

export const reachConfig: ReachConfig = buildConfig({
  deployments: deploymentSource() as Record<string, string | number> | null,
  mezoRpcUrls: [process.env.NEXT_PUBLIC_MEZO_RPC ?? "", "https://rpc.test.mezo.org"],
  // publicnode first: sepolia.base.org rejects eth_getLogs ranges above ~200 blocks (HTTP 413).
  baseRpcUrls: [process.env.NEXT_PUBLIC_BASE_RPC ?? "", "https://base-sepolia-rpc.publicnode.com", "https://sepolia.base.org"],
});

/**
 * Settlement semantics of the recorded deployment. `fallback-v1` (the first public deployment)
 * pays wSMUSD shares whenever a MUSD settlement fails, including relayer-induced out-of-gas;
 * `pending-v2` never switches the payout asset and parks failures as pending settlements.
 */
export const settlementModel: "fallback-v1" | "pending-v2" =
  ((deploymentSource()?.settlementModel as string | undefined) ?? "fallback-v1") === "pending-v2" ? "pending-v2" : "fallback-v1";
export const knownIssues: string[] = (deploymentSource()?.knownIssues as unknown as string[] | undefined) ?? [];

export const isForkMode = process.env.NEXT_PUBLIC_NETWORK_MODE === "fork";
export const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "";
export const deployment = reachConfig.deployment;
export const MEZO_ID = reachConfig.mezo.evmChainId;
export const BASE_ID = reachConfig.base.evmChainId;

export type EvidenceStep = {
  id: string;
  title: string;
  chain: "mezo" | "base" | "offchain";
  status: "PASS" | "FAIL";
  txHash?: string;
  blockNumber?: string;
  explorer?: string;
  details: Record<string, unknown>;
};

export type EvidenceRun = {
  kind: "PUBLIC_TESTNET_RUN" | "LOCAL_FORK_REHEARSAL";
  disclaimer: string;
  runId: string;
  startedAt: string;
  amountMusd: string;
  accounts: { primary: string; secondary: string };
  deployment: Record<string, string>;
  steps: EvidenceStep[];
  reusedTransactions?: Record<string, string>;
};

export const publicRuns = siteData.publicRuns as unknown as EvidenceRun[];
export const rehearsals = siteData.rehearsals as unknown as EvidenceRun[];
export const canonicalRun: EvidenceRun | null = publicRuns[publicRuns.length - 1] ?? null;

export const explorer = {
  mezoTx: (h: string) => `${reachConfig.mezo.explorer}/tx/${h}`,
  mezoAddress: (a: string) => `${reachConfig.mezo.explorer}/address/${a}`,
  baseTx: (h: string) => `${reachConfig.base.explorer}/tx/${h}`,
  baseAddress: (a: string) => `${reachConfig.base.explorer}/address/${a}`,
  wormholescan: (chain: number, emitter: string, seq: string | bigint) =>
    `https://wormholescan.io/#/tx/${chain}/${emitter.toLowerCase().replace(/^0x/, "").padStart(64, "0")}/${seq}?network=Testnet`,
};
