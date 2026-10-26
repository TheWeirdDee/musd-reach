import { createConfig, fallback, http } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { injected, mock, walletConnect } from "wagmi/connectors";
import { defineChain, type Address } from "viem";
import { reachConfig, testHooksEnabled } from "./reach";
import { walletConnectEnabled, walletConnectMetadata, walletConnectProjectId } from "./wallets";

// Chain definitions carry the configured RPCs: wallets use them for wallet_addEthereumChain, and
// connectors that forward requests themselves (e.g. the E2E mock) must hit the same endpoint.
export const mezo = defineChain({ ...reachConfig.mezo.chain, rpcUrls: { default: { http: reachConfig.mezo.rpcUrls } } });
export const base = defineChain({ ...baseSepolia, rpcUrls: { default: { http: reachConfig.base.rpcUrls } } });

// E2E-only mock connector (local forks): needs NEXT_PUBLIC_E2E_ACCOUNT and a non-production build.
const e2eAccount = testHooksEnabled ? (process.env.NEXT_PUBLIC_E2E_ACCOUNT as Address | undefined) : undefined;

const connectors = [
  // Fallback for an injected wallet that has not announced itself over EIP-6963. The chooser only
  // uses it for the wallet the user actually picked, so `window.ethereum` is never treated as
  // "MetaMask" by assumption.
  injected({ shimDisconnect: true }),
  // Offered only when the build carries a project id, so the chooser never lists a dead entry.
  ...(walletConnectEnabled
    ? [walletConnect({ projectId: walletConnectProjectId, metadata: walletConnectMetadata, showQrModal: true })]
    : []),
  ...(e2eAccount ? [mock({ accounts: [e2eAccount], features: { reconnect: true } })] : []),
];

export const wagmiConfig = createConfig({
  chains: [mezo, base],
  // EIP-6963 discovery: every installed wallet announces itself and becomes its own connector
  // (id = reverse DNS, name and icon from the wallet), which is what the chooser lists.
  multiInjectedProviderDiscovery: true,
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