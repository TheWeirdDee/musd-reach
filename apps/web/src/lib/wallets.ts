/**
 * The wallet catalogue behind the "Connect a wallet" dialog, and the one wallet-specific safety
 * notice the application still carries.
 *
 * Every entry is a real integration, not a logo:
 * - an installed injected wallet is reached through its own EIP-6963 announcement (id = reverse
 *   DNS, icon = the icon the wallet itself published), so an installed Rabby is never silently
 *   treated as MetaMask and never shown twice;
 * - WalletConnect is reached through its own connector and only offered when the build carries a
 *   project id, so the list never contains a button that cannot work;
 * - a wallet that is not installed is never offered a connection that cannot succeed: its row links
 *   to the vendor's own install page instead.
 *
 * Logos in `public/wallets` are unmodified vendor assets:
 * - `metamask.svg`  — MetaMask Logo Pack, https://metamask.io/assets
 * - `rabby.svg`     — RabbyHub brand repository, https://github.com/RabbyHub/logo (symbol.svg)
 * - `coinbase.png`  — Coinbase Wallet site icon, https://wallet.coinbase.com/
 * - `walletconnect.svg` — WalletConnect Media Pack,
 *   https://github.com/WalletConnect/walletconnect-assets (Icon / Blue)
 */

import type { EIP1193Provider } from "viem";
import { SITE_URL } from "./metadata";

export type WalletKey = "rabby" | "metamask" | "coinbase" | "walletconnect";

export type WalletSpec = {
  key: WalletKey;
  name: string;
  /** Public path to the vendor's own logo, served unaltered. */
  logo: string;
  /** Fragments matched against an EIP-6963 connector id (reverse DNS) or its announced name. */
  rdns: string[];
  /** Provider flags, used only when a wallet has not announced itself over EIP-6963. */
  flags: string[];
  /** Official install page. It is the only destination offered while the wallet is missing. */
  install: string;
  /** Availability copy shown while the wallet is ready to connect. */
  ready: string;
  /** Availability copy shown while the wallet is missing. */
  missing: string;
};

export const WALLETS: WalletSpec[] = [
  {
    key: "rabby",
    name: "Rabby Wallet",
    logo: "/wallets/rabby.svg",
    rdns: ["rabby"],
    flags: ["isRabby"],
    install: "https://rabby.io/",
    ready: "Detected in this browser",
    missing: "Not detected in this browser",
  },
  {
    key: "metamask",
    name: "MetaMask",
    logo: "/wallets/metamask.svg",
    rdns: ["metamask"],
    flags: ["isMetaMask"],
    install: "https://metamask.io/download/",
    ready: "Detected in this browser",
    missing: "Not detected in this browser",
  },
  {
    key: "coinbase",
    name: "Coinbase Wallet",
    logo: "/wallets/coinbase.png",
    rdns: ["coinbase"],
    flags: ["isCoinbaseWallet"],
    install: "https://www.coinbase.com/wallet",
    ready: "Detected in this browser",
    missing: "Not detected in this browser",
  },
  {
    key: "walletconnect",
    name: "WalletConnect",
    logo: "/wallets/walletconnect.svg",
    rdns: [],
    flags: [],
    install: "https://walletconnect.com/get-started",
    ready: "Scan a QR code with any WalletConnect wallet",
    missing: "Not configured for this build",
  },
];

/**
 * Reown / WalletConnect Cloud project id. It is a public client identifier by design: it is
 * embedded in every browser bundle of a WalletConnect-enabled site and is not a secret. It can be
 * replaced at build time without touching the source.
 */
const projectId = (process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "").trim();

export const walletConnectProjectId = projectId;
/** WalletConnect is listed only when the build can actually open a session. */
export const walletConnectEnabled = projectId.length > 0;

/**
 * Ids of the config-level injected connectors that resolve a *legacy* provider (one that has not
 * announced itself over EIP-6963) out of `window.ethereum.providers` by the vendor's own flag.
 * The chooser uses one only when the matching flag is actually present, so a missing wallet is
 * never offered a connection that cannot succeed, and never borrows another wallet's provider.
 */
export const LEGACY_TARGET_IDS: ReadonlySet<string> = new Set(["rabby", "metaMask", "coinbaseWallet"]);

export const walletConnectMetadata = {
  name: "MUSD Reach",
  description: "Make Mezo savings-backed positions portable to Base Sepolia on public testnets.",
  // The origin the page is actually served from (preview, production or localhost), so wallets
  // that verify origin metadata see the real one instead of a fixed canonical host.
  url: typeof window === "undefined" ? SITE_URL : window.location.origin,
  icons: [`${SITE_URL}/icons/reach-512.png`],
};

/**
 * MetaMask's own classification of this site is still under review, so MetaMask stays in the list
 * with accurate availability instead of being hidden or forced. The notice is contextual: it lives
 * in the wallet chooser next to the MetaMask row, not across the landing page.
 */
export const metamaskAdvisory = {
  text: "MetaMask has reported a security warning for this website, and the review is ongoing. Do not override a warning shown by your wallet.",
  href: "/security",
  linkLabel: "Investigation status",
} as const;

/** A connector id/name/rdns match for a catalogue entry. The generic `injected` connector never matches. */
export function matchesWallet(
  connector: { id?: string; name?: string; type?: string } | null | undefined,
  wallet: WalletSpec,
): boolean {
  if (!connector) return false;
  if (wallet.key === "walletconnect") return connector.type === "walletConnect";
  if (connector.type !== "injected") return false;
  const id = (connector.id ?? "").toLowerCase();
  const name = (connector.name ?? "").toLowerCase();
  if (id === "injected" || name === "injected") return false;
  return wallet.rdns.some((r) => id.includes(r) || name.includes(r));
}

/** Announced providers (EIP-6963) that no catalogue entry claims, listed individually. */
export function isCatalogued(connector: { id?: string; name?: string; type?: string }): boolean {
  return WALLETS.some((w) => matchesWallet(connector, w));
}
/** Legacy wallets must resolve their own provider, never the first window.ethereum entry.
 * Rabby/Coinbase may also advertise isMetaMask for compatibility; their own flag wins.
 */
export function legacyProvider(wallet: WalletSpec): EIP1193Provider | undefined {
  if (typeof window === "undefined") return;
  const root = (window as unknown as { ethereum?: EIP1193Provider & { providers?: EIP1193Provider[] } }).ethereum;
  if (!root) return;
  const providers = root.providers?.length ? root.providers : [root];
  return providers.find((provider) => {
    const flags = provider as unknown as Record<string, unknown>;
    const key = flags.isRabby ? "rabby" : flags.isCoinbaseWallet ? "coinbase" : flags.isMetaMask ? "metamask" : null;
    return key === wallet.key && typeof provider.request === "function";
  });
}
