import { createConfig, fallback, http } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { injected, walletConnect, mock } from "wagmi/connectors";
import { defineChain, type Address } from "viem";
import { reachConfig } from "./reach";

// Chain definitions carry the configured RPCs: wallets use them for wallet_addEthereumChain, and
// connectors that forward requests themselves (e.g. the E2E mock) must hit the same endpoint.
export const mezo = defineChain({ ...reachConfig.mezo.chain, rpcUrls: { default: { http: reachConfig.mezo.rpcUrls } } });
export const base = defineChain({ ...baseSepolia, rpcUrls: { default: { http: reachConfig.base.rpcUrls } } });

const wcProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
// E2E-only mock connector (local forks). Never enabled unless NEXT_PUBLIC_E2E_ACCOUNT is set at build.
const e2eAccount = process.env.NEXT_PUBLIC_E2E_ACCOUNT as Address | undefined;

const connectors = [
  injected({ shimDisconnect: true }),
  ...(wcProjectId
    ? [walletConnect({ projectId: wcProjectId, showQrModal: true, metadata: { name: "MUSD Reach", description: "Portable Mezo savings", url: "https://musd-reach.app", icons: [] } })]
    : []),
  ...(e2eAccount ? [mock({ accounts: [e2eAccount], features: { reconnect: true } })] : []),
];

export const wagmiConfig = createConfig({
  chains: [mezo, base],
  connectors,
  transports: {
    [mezo.id]: fallback(reachConfig.mezo.rpcUrls.map((u) => http(u))),
    [base.id]: fallback(reachConfig.base.rpcUrls.map((u) => http(u))),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
