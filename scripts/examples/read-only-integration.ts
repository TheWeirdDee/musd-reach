import { buildConfig, createReachClients, readPosition, readWrapperState, reconcile } from "@musd-reach/sdk";
import type { Address } from "viem";
import deployment from "../../deployments/testnet.json";

// A private workspace package: clone the repository and run pnpm install first.
const config = buildConfig({ deployments: deployment });
const clients = createReachClients(config);

export async function inspectSavings(account: Address) {
  const [position, wrapper, backing] = await Promise.all([
    readPosition(clients, config, account),
    readWrapperState(clients.mezo, config),
    reconcile(clients, config),
  ]);
  return { position, wrapper, backing };
}

export async function inspectReturn(transferId: `0x${string}`) {
  if (!config.deployment) throw new Error("No Reach deployment configured");
  const { reachSourceGatewayAbi } = await import("@musd-reach/sdk");
  const [consumed, pending] = await Promise.all([
    clients.mezo.readContract({ address: config.deployment.sourceGateway, abi: reachSourceGatewayAbi, functionName: "transferConsumed", args: [transferId] }),
    clients.mezo.readContract({ address: config.deployment.sourceGateway, abi: reachSourceGatewayAbi, functionName: "pendingSettlements", args: [transferId] }),
  ]);
  // Consumption confirms delivery. It does not by itself confirm a MUSD payout.
  return { consumed, recipient: pending[0], shares: pending[1], minAssets: pending[2] };
}
