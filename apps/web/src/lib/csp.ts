/**
 * Content-Security-Policy for every HTML response, built from the endpoints this build is
 * configured to use. Nothing is wildcarded: a new RPC, API or wallet relay must be configured
 * (and therefore appear here) before the browser will talk to it.
 *
 * Scripts: a per-request nonce plus 'strict-dynamic'. Next.js puts the nonce on its own inline
 * and chunk scripts; no inline script without it can run, and 'unsafe-eval' exists only in dev
 * (React's dev tooling needs it). Injected wallets (MetaMask, Rabby) run as extension content
 * scripts, which page CSP does not govern, and announce themselves over EIP-6963 events.
 *
 * Styles: stylesheet files and the nonce only. No server-rendered markup carries a style
 * attribute (animations and progress bars set styles from script, which CSP does not govern);
 * e2e/csp.mjs fails on any style violation. Dev adds 'unsafe-inline' for Next's error overlay.
 */

/** WalletConnect / Reown endpoints, added only when a WalletConnect project id is configured. */
const WALLETCONNECT = {
  connect: [
    "https://rpc.walletconnect.org",
    "https://rpc.walletconnect.com",
    "https://relay.walletconnect.org",
    "https://relay.walletconnect.com",
    "wss://relay.walletconnect.org",
    "wss://relay.walletconnect.com",
    "https://pulse.walletconnect.org",
    "https://api.web3modal.org",
    "https://explorer-api.walletconnect.com",
  ],
  frame: ["https://verify.walletconnect.org", "https://verify.walletconnect.com"],
  img: ["https://explorer-api.walletconnect.com"],
};

export type CspInput = {
  nonce: string;
  dev: boolean;
  /** Every RPC URL the app's transports and wallet chain definitions may call. */
  rpcUrls: readonly string[];
  /** NEXT_PUBLIC_API_URL; empty when the read API is not configured. */
  apiUrl: string;
  walletConnect: boolean;
};

/** Scheme + host (+ port) of a URL, or null if it is not an http(s)/ws(s) URL. */
export function originOf(url: string): string | null {
  try {
    const u = new URL(url);
    return ["http:", "https:", "ws:", "wss:"].includes(u.protocol) ? u.origin : null;
  } catch {
    return null;
  }
}

export function buildCsp({ nonce, dev, rpcUrls, apiUrl, walletConnect }: CspInput): string {
  const connect = new Set<string>(["'self'"]);
  for (const u of [...rpcUrls, apiUrl]) {
    const o = originOf(u);
    if (o) connect.add(o);
  }
  if (walletConnect) WALLETCONNECT.connect.forEach((o) => connect.add(o));
  if (dev) connect.add("ws:"); // Next.js hot reload

  const allHttps = [...connect].every((s) => s.startsWith("'") || s.startsWith("https:") || s.startsWith("wss:"));

  const directives: [string, string[]][] = [
    ["default-src", ["'self'"]],
    ["script-src", ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(dev ? ["'unsafe-eval'"] : [])]],
    ["style-src", ["'self'", ...(dev ? ["'unsafe-inline'"] : [`'nonce-${nonce}'`])]],
    ["img-src", ["'self'", "data:", "blob:", ...(walletConnect ? WALLETCONNECT.img : [])]],
    ["font-src", ["'self'"]],
    ["connect-src", [...connect]],
    ["frame-src", walletConnect ? WALLETCONNECT.frame : ["'none'"]],
    ["worker-src", ["'self'", "blob:"]],
    ["manifest-src", ["'self'"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'none'"]],
  ];
  const policy = directives.map(([k, v]) => `${k} ${v.join(" ")}`);
  // Only when every endpoint is already https: upgrading a local fork RPC (http://127.0.0.1) would break it.
  if (!dev && allHttps) policy.push("upgrade-insecure-requests");
  return policy.join("; ");
}
