"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { shortHex } from "@musd-reach/sdk";
import { Button, Chip, Spinner } from "@/components/ui/primitives";
import { BASE_ID, MEZO_ID, explorer } from "@/lib/reach";
import { cn } from "@/lib/cn";
import { useIsClient } from "@/lib/useIsClient";
import { useWalletChainId } from "@/lib/walletChain";
import Link from "next/link";
import {
  WALLETS,
  legacyProvider,
  isCatalogued,
  matchesWallet,
  metamaskAdvisory,
  walletConnectEnabled,
  type WalletSpec,
} from "@/lib/wallets";

function networkName(id: number | undefined) {
  if (id === undefined) return "Checking network";
  if (id === MEZO_ID) return "Mezo testnet";
  if (id === BASE_ID) return "Base Sepolia";
  return `Unsupported (${id})`;
}

type Ethereumish = {
  providers?: Record<string, unknown>[];
  isRabby?: boolean;
  isMetaMask?: boolean;
  isCoinbaseWallet?: boolean;
};

/**
 * Which catalogue wallets an injected provider exposes when it has not announced itself over
 * EIP-6963, plus whether some unidentified injected provider exists at all. Injected wallets
 * install themselves before page scripts run, so the answer is read once on the client and cached:
 * a stable snapshot keeps it safe for `useSyncExternalStore` and out of the server render.
 */
type InjectedState = { flags: Record<string, boolean>; unidentified: boolean };
const NO_INJECTED: InjectedState = { flags: {}, unidentified: false };
const subscribeInjected = (notify: () => void) => {
  const refresh = () => { injectedCache = null; notify(); };
  window.addEventListener("ethereum#initialized", refresh);
  window.addEventListener("eip6963:announceProvider", refresh);
  return () => {
    window.removeEventListener("ethereum#initialized", refresh);
    window.removeEventListener("eip6963:announceProvider", refresh);
  };
};
let injectedCache: InjectedState | null = null;
function readInjected(): InjectedState {
  if (injectedCache) return injectedCache;
  const flags: Record<string, boolean> = {};
  let unidentified = false;
  const eth = typeof window === "undefined" ? undefined : (window as { ethereum?: Ethereumish }).ethereum;
  if (eth) {
    const providers: Record<string, unknown>[] =
      Array.isArray(eth.providers) && eth.providers.length ? eth.providers : [eth];
    for (const w of WALLETS) flags[w.key] = !!legacyProvider(w);
    unidentified = providers.some((p) => p && !WALLETS.some((w) => w.flags.some((f) => p[f] === true)));
  }
  injectedCache = { flags, unidentified };
  return injectedCache;
}

const rowCls =
  "flex w-full items-center gap-3 rounded-sm border border-ink-600 bg-ink-850 px-3 py-3 transition-colors duration-150 hover:border-ink-400 hover:bg-ink-800";

/**
 * Vendor logo, unaltered. `src` is a vendor asset path or the data URI the wallet itself
 * announced over EIP-6963; without either, a neutral monogram keeps the row honest. The row's
 * accessible name already carries the wallet name, so the mark itself is decorative.
 */
function WalletLogo({ src, name }: { src?: string | null; name: string }) {
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-md border border-ink-700 bg-ink-950">
      {src ? (
        // Vendor SVG/PNG assets are served unaltered at a fixed 28px; next/image adds nothing here.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" width={36} height={36} className="h-7 w-7 object-contain" />
      ) : (
        <span className="text-sm font-semibold text-ink-300" aria-hidden>
          {name.trim().slice(0, 1).toUpperCase()}
        </span>
      )}
    </span>
  );
}

export function WalletButton({ compact }: { compact?: boolean }) {
  const { address, status, connector } = useAccount();
  const chainId = useWalletChainId();
  const { connectors, connect, isPending, error, reset } = useConnect();
  const { disconnectAsync } = useDisconnect();
  const switcher = useSwitchChain();
  const [view, setView] = useState<null | "account" | "choose">(null);
  const mounted = useIsClient();
  const panel = useRef<HTMLDivElement>(null);
  const lastFocused = useRef<HTMLElement | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pairing, setPairing] = useState<{ uri: string; qr: string } | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const attempt = useRef(0);
  const pendingConnector = useRef<(typeof connectors)[number] | null>(null);

  // A local QR image avoids third-party modal styles that violate the production CSP.
  useEffect(() => {
    const target = connectors.find((c) => c.type === "walletConnect");
    if (!target) return;
    const message = (event: { type: string; data?: unknown }) => {
      if (event.type !== "display_uri" || typeof event.data !== "string") return;
      const uri = event.data;
      if (!uri.startsWith("wc:")) return;
      const current = attempt.current;
      import("qrcode").then((qr) => qr.toDataURL(uri, { width: 280, margin: 2 }))
        .then((qr) => { if (attempt.current === current) setPairing({ uri, qr }); })
        .catch(() => setConnectionError("Could not create the pairing code. Cancel and try again."));
    };
    target.emitter.on("message", message);
    return () => { target.emitter.off("message", message); };
  }, [connectors]);

  const cancelConnection = () => {
    attempt.current++;
    const target = pendingConnector.current;
    pendingConnector.current = null;
    setPairing(null);
    setPendingKey(null);
    reset();
    if (target?.type === "walletConnect") {
      target.getProvider().then((provider) => {
        const pairingProvider = provider as { signer?: { abortPairingAttempt?: () => void } };
        pairingProvider.signer?.abortPairingAttempt?.();
      }).catch(() => {});
    }
  };
  const [restoreSlow, setRestoreSlow] = useState(false);
  const injected = useSyncExternalStore(subscribeInjected, readInjected, () => NO_INJECTED);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    if (status !== "reconnecting") return;
    const timer = setTimeout(() => setRestoreSlow(true), 10_000);
    return () => clearTimeout(timer);
  }, [status]);

  // Modal behaviour: focus moves in, stays in (Tab wrap), Escape closes, the page behind does not
  // scroll, and focus returns to the trigger when it closes.
  useEffect(() => {
    if (!view) return;
    lastFocused.current = document.activeElement as HTMLElement | null;
    const node = panel.current;
    const focusable = () =>
      Array.from(
        node?.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), [tabindex]:not([tabindex='-1'])") ?? [],
      ).filter((el) => el.getClientRects().length > 0);
    const first = focusable()[0];
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        attempt.current++;
        const target = pendingConnector.current;
        pendingConnector.current = null;
        if (target?.type === "walletConnect") target.getProvider().then((provider) => (provider as { signer?: { abortPairingAttempt?: () => void } }).signer?.abortPairingAttempt?.()).catch(() => {});
        setPairing(null);
        setPendingKey(null);
        reset();
        setView(null);
        return;
      }
      if (e.key !== "Tab") return;
      const els = focusable();
      if (!els.length) return;
      const active = document.activeElement;
      if (node && !node.contains(active)) {
        e.preventDefault();
        els[0]!.focus();
      } else if (e.shiftKey && active === els[0]) {
        e.preventDefault();
        els[els.length - 1]!.focus();
      } else if (!e.shiftKey && active === els[els.length - 1]) {
        e.preventDefault();
        els[0]!.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = previousOverflow;
      if (lastFocused.current?.isConnected) lastFocused.current.focus();
    };
  }, [view, reset]);

  const catalogue = WALLETS.filter((w) => w.key !== "walletconnect" || walletConnectEnabled);
  const generic = connectors.find((c) => c.type === "injected" && c.id === "injected");
  const announced = connectors.filter((c) => c.type === "injected" && c.id !== "injected" && !c.id.startsWith("reach."));

  /** The connector that can actually serve this catalogue entry, or undefined when it is missing. */
  const connectorFor = (w: WalletSpec) =>
    announced.find((c) => matchesWallet(c, w)) ??
    (injected.flags[w.key] ? connectors.find((c) => c.id === `reach.${w.key}`) : undefined) ??
    (w.key === "walletconnect" ? connectors.find((c) => c.type === "walletConnect") : undefined);

  const detected = (w: WalletSpec) => (w.key === "walletconnect" ? walletConnectEnabled : !!connectorFor(w));

  /** Connect the connector the user picked, replacing any previous session. */
  const connectWith = (target: (typeof connectors)[number], key: string) => {
    if (isPending) return;
    reset();
    setConnectionError(null);
    setPairing(null);
    const current = ++attempt.current;
    pendingConnector.current = target;
    setPendingKey(key);
    const done = () => {
      if (attempt.current !== current) {
        disconnectAsync({ connector: target }).catch(() => {});
        return;
      }
      pendingConnector.current = null;
      setPairing(null);
      setPendingKey(null);
      setView(null);
    };
    const failed = () => {
      if (attempt.current !== current) return;
      pendingConnector.current = null;
      setPairing(null);
      setPendingKey(null);
    };
    // Switching wallets: drop the current session first so the app never silently stays on the
    // previously chosen wallet when the user picked a different one.
    if (status === "connected" && connector && connector.uid !== target.uid) {
      disconnectAsync().then(
        () => connect({ connector: target }, { onSuccess: done, onError: failed }),
        failed,
      );
      return;
    }
    connect({ connector: target }, { onSuccess: done, onError: failed });
  };

  const close = () => { if (pendingConnector.current) cancelConnection(); setView(null); };

  if (!mounted || status === "reconnecting") {
    return (
      <Button intent="secondary" disabled={!restoreSlow} onClick={() => disconnectAsync().catch(() => {})} className={cn(compact ? "h-10 px-3" : "")} aria-live="polite">
        <span className="h-2 w-2 animate-pulse-dot rounded-full bg-ink-400" aria-hidden />
        <span className="text-ink-300">{restoreSlow ? "Reset wallet session" : "Restoring wallet"}</span>
      </Button>
    );
  }

  const supported = chainId === MEZO_ID || chainId === BASE_ID;
  const connected = status === "connected" && !!address;
  const walletName = connector?.name === "Injected" ? "Browser wallet" : connector?.name;
  const others = connectors.filter((c) => (announced.some((a) => a.uid === c.uid) && !isCatalogued(c)) || c.type === "mock");

  const trigger = (
    <Button
      intent="secondary"
      onClick={() => setView(connected ? "account" : "choose")}
      aria-expanded={view !== null}
      aria-haspopup="dialog"
      className={cn(compact ? "h-10 px-3" : "")}
    >
      {connected && address ? (
        <>
          <span className={cn("h-2 w-2 rounded-full", chainId === undefined ? "bg-ink-400" : supported ? "bg-sage-400" : "bg-rust-400")} aria-hidden />
          <span className="num text-[0.8125rem]">{shortHex(address, 4, 4)}</span>
        </>
      ) : (
        "Connect wallet"
      )}
    </Button>
  );

  const chooser = view === "choose";

  return (
    <div className="relative">
      {trigger}

      {view &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            className="absolute inset-0 h-full w-full cursor-default bg-ink-950/75 backdrop-blur-[2px]"
            onClick={close}
          />
          <div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descId}
            className="relative max-h-[calc(100dvh-1.5rem)] w-full max-w-[27rem] overflow-y-auto rounded-t-md border border-ink-600 bg-ink-900 p-5 shadow-lift sm:rounded-md sm:p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id={titleId} className="text-lg font-semibold tracking-[-0.02em] text-bone-50">
                  Connect a wallet
                </h2>
                <p id={descId} className="mt-1 text-sm leading-6 text-ink-300">
                  Choose a wallet to use MUSD Reach on Mezo testnet and Base Sepolia.
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close wallet chooser"
                className="-mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-sm text-ink-300 transition-colors hover:bg-ink-800 hover:text-bone-100"
              >
                <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </button>
            </div>

            {chooser ? (
              <div className="mt-5">
                {pendingKey === "walletconnect" && (
                  <div className="mb-4 space-y-3 rounded-sm border border-ink-600 p-3" aria-live="polite">
                    <p className="text-sm text-bone-100">{pairing ? "Scan with your wallet" : "Opening WalletConnect"}</p>
                    {pairing ? <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={pairing.qr} width={280} height={280} alt="WalletConnect pairing QR code" className="mx-auto h-auto max-w-full rounded-sm" />
                      <p className="text-xs leading-relaxed text-ink-300">Scan from a WalletConnect-compatible mobile wallet. It must support Mezo testnet and Base Sepolia. Pairing is not a transaction approval.</p>
                      <a href={pairing.uri} className="block text-sm text-ember-400 underline underline-offset-4">Open a compatible wallet</a>
                      <Button intent="secondary" onClick={() => navigator.clipboard?.writeText(pairing.uri).catch(() => setConnectionError("Clipboard unavailable. Scan the QR code instead."))}>Copy pairing link</Button>
                    </> : <p className="text-xs text-ink-300">Waiting for the relay. You can cancel and choose an installed wallet.</p>}
                    <Button intent="ghost" onClick={cancelConnection}>Cancel connection</Button>
                  </div>
                )}
                <ul className="space-y-2.5">
                  {catalogue.map((w) => {
                    const target = connectorFor(w);
                    const available = detected(w);
                    const busy = pendingKey === w.key;
                    // A missing wallet is never offered a connection that cannot succeed: its row
                    // links to the vendor's own install page instead of a dead button.
                    const label = available ? "Connect" : "Get";
                    return (
                      <li key={w.key}>
                        {available ? (
                          <button
                            type="button"
                            className={rowCls}
                            onClick={() => target && connectWith(target, w.key)}
                            disabled={isPending}
                            aria-label={`${w.name} — ${label}`}
                          >
                            <WalletLogo src={w.logo} name={w.name} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-bone-100">{w.name}</span>
                              <span className="block truncate text-xs text-ink-400">{w.ready}</span>
                            </span>
                            {busy || isPending ? (
                              <Spinner className="h-4 w-4 text-ink-300" />
                            ) : (
                              <span className="shrink-0 text-xs font-medium text-ember-400">Connect →</span>
                            )}
                          </button>
                        ) : (
                          <a
                            href={w.install}
                            target="_blank"
                            rel="noreferrer"
                            className={cn(rowCls, "group")}
                            aria-label={`${w.name} — ${label} (opens the vendor site)`}
                          >
                            <WalletLogo src={w.logo} name={w.name} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-bone-100">{w.name}</span>
                              <span className="block truncate text-xs text-ink-400">{w.missing}</span>
                            </span>
                            <span className="shrink-0 text-xs font-medium text-ink-200 underline underline-offset-4 group-hover:text-ember-400">
                              Get →
                            </span>
                          </a>
                        )}
                        {w.key === "metamask" && (
                          <div role="note" className="mt-2 rounded-sm border border-sand-500/30 bg-sand-500/[0.06] px-3 py-2.5 text-xs leading-relaxed text-sand-300">
                            {metamaskAdvisory.text}{" "}
                            <Link href={metamaskAdvisory.href} className="font-medium underline underline-offset-4">
                              {metamaskAdvisory.linkLabel} →
                            </Link>
                          </div>
                        )}
                      </li>
                    );
                  })}

                  {others.map((c) => (
                    <li key={c.uid}>
                      <button
                        type="button"
                        className={rowCls}
                        onClick={() => connectWith(c, c.uid)}
                        disabled={isPending}
                        aria-label={`${c.name} — Connect`}
                      >
                        <WalletLogo src={c.icon?.startsWith("data:") ? c.icon : null} name={c.name ?? "Wallet"} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-bone-100">{c.name}</span>
                          <span className="block truncate text-xs text-ink-400">Announced by this browser (EIP-6963)</span>
                        </span>
                        {pendingKey === c.uid || isPending ? (
                          <Spinner className="h-4 w-4 text-ink-300" />
                        ) : (
                          <span className="shrink-0 text-xs font-medium text-ember-400">Connect →</span>
                        )}
                      </button>
                    </li>
                  ))}

                  {/* No wallet announced itself: offer the one injected provider that exists,
                      identified honestly as a browser wallet rather than assumed to be MetaMask. */}
                  {!announced.length && generic && injected.unidentified && (
                    <li>
                      <button
                        type="button"
                        className={rowCls}
                        onClick={() => connectWith(generic, "injected")}
                        disabled={isPending}
                        aria-label="Browser wallet — Connect"
                      >
                        <WalletLogo name="Browser wallet" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-bone-100">Browser wallet</span>
                          <span className="block truncate text-xs text-ink-400">
                            One injected wallet is installed and does not announce its name
                          </span>
                        </span>
                        {pendingKey === "injected" || isPending ? (
                          <Spinner className="h-4 w-4 text-ink-300" />
                        ) : (
                          <span className="shrink-0 text-xs font-medium text-ember-400">Connect →</span>
                        )}
                      </button>
                    </li>
                  )}
                </ul>

                {connectionError && <p role="alert" className="mt-3 text-xs text-rust-300">{connectionError}</p>}
                {error && (
                  <p role="alert" className="mt-3 text-xs leading-relaxed text-rust-300">
                    {/rejected|denied/i.test(error.message)
                      ? "Connection request was rejected in the wallet. Nothing was changed."
                      : /not found|provider/i.test(error.message)
                        ? "No wallet answered the request. Choose a wallet that is installed, or install one from its official site."
                        : error.message.split("\n")[0]}
                  </p>
                )}

                <p className="mt-4 border-t border-ink-700 pt-3 text-xs leading-relaxed text-ink-400">
                  Connecting requests your account address only — never a token approval or a signature.
                  Every approval is a separate, exact-amount transaction you review.
                </p>
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                <div>
                  <p className="kicker text-ink-300">Connected · {walletName}</p>
                  <p className="num mt-2 break-hash text-sm text-bone-100">{address}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Chip tone={supported ? "verified" : "failed"}>{networkName(chainId)}</Chip>
                </div>
                {chainId !== undefined && (
                  <div className="space-y-2">
                    <p className="text-xs leading-relaxed text-ink-300">
                      Reach runs on Mezo testnet and Base Sepolia. Each action also asks to switch to the network it needs.
                    </p>
                    <div className="grid gap-2">
                      {[
                        { id: MEZO_ID, label: "Switch to Mezo testnet" },
                        { id: BASE_ID, label: "Switch to Base Sepolia" },
                      ].map((n) => (
                        <Button
                          key={n.id}
                          intent="secondary"
                          className="w-full"
                          busy={switcher.isPending && switcher.variables?.chainId === n.id}
                          disabled={switcher.isPending || chainId === n.id}
                          onClick={() => {
                            switcher.reset();
                            switcher.switchChain({ chainId: n.id as never });
                          }}
                        >
                          {n.label}
                        </Button>
                      ))}
                    </div>
                    {switcher.error && (
                      <p role="alert" className="text-xs leading-relaxed text-rust-300">
                        {/rejected|denied/i.test(switcher.error.message)
                          ? "Network switch was rejected in the wallet. Nothing was changed."
                          : switcher.error.message.split("\n")[0]}
                      </p>
                    )}
                  </div>
                )}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Button intent="secondary" onClick={() => { navigator.clipboard?.writeText(address!); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
                    {copied ? "Copied" : "Copy address"}
                  </Button>
                  <a
                    href={(chainId === BASE_ID ? explorer.baseAddress : explorer.mezoAddress)(address!)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-sm border border-ink-600 bg-ink-850 px-5 text-[0.9375rem] font-medium tracking-[-0.01em] text-bone-100 transition-colors hover:border-ink-400 hover:bg-ink-800"
                  >
                    View in explorer ↗
                  </a>
                  <Button intent="secondary" onClick={() => setView("choose")}>
                    Switch wallet
                  </Button>
                  <Button
                    intent="secondary"
                    onClick={() => {
                      disconnectAsync().catch(() => {});
                      setView(null);
                    }}
                  >
                    Disconnect
                  </Button>
                </div>
                <p className="text-xs leading-relaxed text-ink-400">
                  {connector?.id === "injected" ? "This browser provider does not identify itself. Choose it again after refreshing." : "This wallet is the only one this page will use until you switch. Refreshing restores it, not another wallet."}
                </p>
              </div>
            )}

            {chooser && connected && (
              <div className="mt-4 border-t border-ink-700 pt-3">
                <Button intent="ghost" className="px-0" onClick={() => setView("account")}>
                  ← Back to {shortHex(address!, 4, 4)}
                </Button>
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
