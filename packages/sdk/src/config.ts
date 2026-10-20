import { defineChain, getAddress, type Address, type Chain } from "viem";
import { baseSepolia } from "viem/chains";
import registryJson from "@musd-reach/protocol-registry";

export type ReachDeployment = {
  wrapper: Address;
  sourceGateway: Address;
  destinationGateway: Address;
  receipt: Address;
  wrapperDeployBlock: bigint;
  sourceDeployBlock: bigint;
  destinationDeployBlock: bigint;
  deployer?: Address;
  guardian?: Address;
};

export type ReachConfig = {
  mezo: {
    chain: Chain;
    evmChainId: number;
    wormholeChainId: number;
    rpcUrls: string[];
    explorer: string;
    musd: Address;
    savingsVault: Address;
    savingsVaultImplementation: Address;
    wormholeCore: Address;
  };
  base: {
    chain: Chain;
    evmChainId: number;
    wormholeChainId: number;
    rpcUrls: string[];
    explorer: string;
    wormholeCore: Address;
  };
  wormhole: { api: string; consistencyLevel: number; guardians: Address[] };
  /** `null` until a real deployment is recorded. Never substitute placeholder addresses. */
  deployment: ReachDeployment | null;
};

export const registry = registryJson;

export const mezoTestnet = defineChain({
  id: 31611,
  name: "Mezo Testnet",
  nativeCurrency: { name: "Bitcoin", symbol: "BTC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.test.mezo.org"] } },
  blockExplorers: { default: { name: "Mezo Explorer", url: "https://explorer.test.mezo.org" } },
  testnet: true,
});

/** Shape of deployments/testnet.json written by DeployReach.s.sol. */
export type DeploymentsFile = Partial<Record<string, string | number>>;

export function parseDeployment(file: DeploymentsFile | null | undefined): ReachDeployment | null {
  if (!file) return null;
  const req = ["wrapper", "sourceGateway", "destinationGateway", "receipt"] as const;
  for (const k of req) if (typeof file[k] !== "string") return null;
  const big = (v: unknown) => (v === undefined || v === null || v === "" ? 0n : BigInt(v as string | number));
  return {
    wrapper: getAddress(file.wrapper as string),
    sourceGateway: getAddress(file.sourceGateway as string),
    destinationGateway: getAddress(file.destinationGateway as string),
    receipt: getAddress(file.receipt as string),
    wrapperDeployBlock: big(file.wrapperDeployBlock),
    sourceDeployBlock: big(file.sourceDeployBlock),
    destinationDeployBlock: big(file.destinationDeployBlock),
    deployer: typeof file.deployer === "string" ? getAddress(file.deployer) : undefined,
    guardian: typeof file.guardian === "string" ? getAddress(file.guardian) : undefined,
  };
}

export function buildConfig(opts: {
  deployments?: DeploymentsFile | null;
  mezoRpcUrls?: string[];
  baseRpcUrls?: string[];
} = {}): ReachConfig {
  const r = registryJson;
  const mezoRpc = opts.mezoRpcUrls?.filter(Boolean).length ? opts.mezoRpcUrls.filter(Boolean) : r.chains.mezo.rpc;
  const baseRpc = opts.baseRpcUrls?.filter(Boolean).length ? opts.baseRpcUrls.filter(Boolean) : r.chains.base.rpc;
  return {
    mezo: {
      chain: mezoTestnet,
      evmChainId: r.chains.mezo.evmChainId,
      wormholeChainId: r.chains.mezo.wormholeChainId,
      rpcUrls: mezoRpc,
      explorer: r.chains.mezo.explorer,
      musd: getAddress(r.mezo.musd.address),
      savingsVault: getAddress(r.mezo.savingsVault.address),
      savingsVaultImplementation: getAddress(r.mezo.savingsVault.implementation),
      wormholeCore: getAddress(r.mezo.wormholeCore),
    },
    base: {
      chain: baseSepolia,
      evmChainId: r.chains.base.evmChainId,
      wormholeChainId: r.chains.base.wormholeChainId,
      rpcUrls: baseRpc,
      explorer: r.chains.base.explorer,
      wormholeCore: getAddress(r.base.wormholeCore),
    },
    wormhole: {
      api: r.wormhole.api,
      consistencyLevel: r.wormhole.consistencyLevel,
      guardians: r.wormhole.guardians.map((g) => getAddress(g)),
    },
    deployment: parseDeployment(opts.deployments),
  };
}

export const explorerTx = (explorer: string, hash: string) => `${explorer.replace(/\/$/, "")}/tx/${hash}`;
export const explorerAddress = (explorer: string, addr: string) =>
  `${explorer.replace(/\/$/, "")}/address/${addr}`;
export const wormholescanTx = (hash: string) => `https://wormholescan.io/#/tx/${hash}?network=Testnet`;
