"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { shortHex } from "@musd-reach/sdk";
import { Button, Chip } from "@/components/ui/primitives";
import { MEZO_ID, BASE_ID } from "@/lib/reach";
import { cn } from "@/lib/cn";
import { useIsClient } from "@/lib/useIsClient";
import { useWalletChainId } from "@/lib/walletChain";

function networkName(id: number | undefined) {
  if (id === undefined) return "Checking network";
  if (id === MEZO_ID) return "Mezo testnet";
  if (id === BASE_ID) return "Base Sepolia";
  return `Unsupported (${id})`;
}

export function WalletButton({ compact }: { compact?: boolean }) {
  const { address, status, connector } = useAccount();
  const chainId = useWalletChainId();
  const { connectors, connect, isPending, error, reset } = useConnect();
  const { disconnect } = useDisconnect();
  const switcher = useSwitchChain();
  const [open, setOpen] = useState(false);
  const mounted = useIsClient();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Before hydration and while wagmi restores a session, render a stable placeholder so a
  // refresh never flashes "disconnected" for a connected user.
  if (!mounted || status === "reconnecting") {
    return (
      <Button intent="secondary" disabled className={cn(compact ? "h-10 px-3" : "")} aria-live="polite">
        <span className="h-2 w-2 animate-pulse-dot rounded-full bg-ink-400" aria-hidden />
        <span className="text-ink-300">Restoring wallet</span>
      </Button>
    );
  }

  const supported = chainId === MEZO_ID || chainId === BASE_ID;
  // EIP-6963 wallets announce themselves by name; the generic injected connector then points at
  // one of them, so listing both shows the same wallet twice.
  const announced = connectors.some((c) => c.type === "injected" && c.id !== "injected");
  const shown = connectors.filter((c) => !(announced && c.id === "injected"));

  return (
    <div className="relative" ref={ref}>
      {status === "connected" && address ? (
        <Button intent="secondary" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="dialog" className={cn(compact ? "h-10 px-3" : "")}>
          <span className={cn("h-2 w-2 rounded-full", chainId === undefined ? "bg-ink-400" : supported ? "bg-sage-400" : "bg-rust-400")} aria-hidden />
          <span className="num text-[0.8125rem]">{shortHex(address, 4, 4)}</span>
        </Button>
      ) : (
        <Button intent="secondary" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="dialog" className={cn(compact ? "h-10 px-3" : "")}>
          Connect wallet
        </Button>
      )}

      {open && (
        <div role="dialog" aria-label="Wallet" className="absolute right-0 z-50 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-md border border-ink-600 bg-ink-850 p-4 shadow-lift">
          {status === "connected" && address ? (
            <div className="space-y-4">
              <div>
                <p className="kicker text-ink-300">Connected · {connector?.name === "Injected" ? "Browser wallet" : connector?.name}</p>
                <p className="num mt-2 break-hash text-sm text-bone-100">{address}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone={supported ? "verified" : "failed"}>{networkName(chainId)}</Chip>
              </div>
              {!supported && chainId !== undefined && (
                // Without this, a wallet on another network with no balance has no way in: every action is disabled.
                <div className="space-y-2">
                  <p className="text-xs leading-relaxed text-ink-300">Reach runs on Mezo testnet and Base Sepolia. Each action also asks to switch to the network it needs.</p>
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
                      {/rejected|denied/i.test(switcher.error.message) ? "Network switch was rejected in the wallet. Nothing was changed." : switcher.error.message.split("\n")[0]}
                    </p>
                  )}
                </div>
              )}
              <div className="flex gap-2">
                <Button intent="secondary" className="flex-1" onClick={() => navigator.clipboard?.writeText(address)}>
                  Copy
                </Button>
                <Button
                  intent="secondary"
                  className="flex-1"
                  onClick={() => {
                    disconnect();
                    setOpen(false);
                  }}
                >
                  Disconnect
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="kicker text-ink-300">Choose a wallet</p>
              {shown.length === 0 && <p className="text-sm text-ink-300">No wallet connectors are available in this browser.</p>}
              <ul className="space-y-2">
                {shown.map((c) => (
                  <li key={c.uid}>
                    <Button
                      intent="secondary"
                      className="w-full justify-between"
                      busy={isPending}
                      onClick={() => {
                        reset();
                        connect({ connector: c }, { onSuccess: () => setOpen(false) });
                      }}
                    >
                      <span>{c.name === "Injected" ? "Browser wallet" : c.name}</span>
                    </Button>
                  </li>
                ))}
              </ul>
              {error && (
                <p role="alert" className="text-xs leading-relaxed text-rust-300">
                  {/rejected|denied/i.test(error.message)
                    ? "Connection request was rejected in the wallet. Nothing was changed."
                    : /not found|provider/i.test(error.message)
                      ? "No browser wallet was found. Install one (for example MetaMask or Rabby), or browse read-only."
                      : error.message.split("\n")[0]}
                </p>
              )}
              <p className="text-xs leading-relaxed text-ink-400">Read-only browsing works without a wallet. Connecting never grants spending rights; every approval is a separate, exact-amount signature.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
