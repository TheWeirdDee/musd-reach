"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useAccount } from "wagmi";
import { parseAmount, formatAmount } from "@musd-reach/sdk";
import { Chip, Notice, Spinner, Hash, Button } from "@/components/ui/primitives";
import { WalletButton } from "@/components/site/WalletButton";
import { deployment, explorer, MEZO_ID } from "@/lib/reach";
import { phaseLabel, type TxState } from "@/lib/tx";
import { cn } from "@/lib/cn";
import { useWalletChainId } from "@/lib/walletChain";

const tabs = [
  { href: "/app", label: "Portfolio" },
  { href: "/app/wrap", label: "Wrap" },
  { href: "/app/portable/new", label: "Make portable" },
  { href: "/app/redeem", label: "Redeem" },
  { href: "/app/history", label: "History" },
];

export function AppNav() {
  const path = usePathname();
  return (
    <nav aria-label="App" className="relative">
      <ul className="flex flex-wrap gap-1 border-b border-ink-700">
        {tabs.map((t) => {
          const active = t.href === "/app" ? path === "/app" : path?.startsWith(t.href);
          return (
            <li key={t.href}>
              <Link href={t.href} aria-current={active ? "page" : undefined} className={cn("relative inline-flex h-11 items-center px-3 text-sm transition-colors", active ? "text-bone-50" : "text-ink-300 hover:text-bone-100")}>
                {t.label}
                {active && <span className="absolute inset-x-3 -bottom-px h-0.5 bg-ember-500" aria-hidden />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function PageTitle({ kicker, title, children }: { kicker: string; title: ReactNode; children?: ReactNode }) {
  return (
    <header className="app-page-title">
      <p className="kicker text-ink-300">{kicker}</p>
      <h1 className="app-heading mt-3 font-semibold tracking-tight text-bone-50">{title}</h1>
      {children && <div className="mt-4 max-w-2xl text-base leading-7 text-ink-300">{children}</div>}
    </header>
  );
}

/** Shown wherever an action needs Reach contracts that do not exist yet. */
export function NotDeployedNotice() {
  return (
    <Notice tone="pending" title="Reach contracts are not deployed on public testnets yet">
      Actions that need Reach (wrap, lock, mint, redeem) are disabled rather than simulated. Native balances below are read live from Mezo testnet. Deployment status updates here as soon as real contracts exist.
    </Notice>
  );
}

export function ConnectPrompt({ what }: { what: string }) {
  return (
    <div className="flex flex-col items-start gap-4 rounded-md border border-dashed border-ink-600 p-6 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm leading-relaxed text-ink-300">{`Connect a wallet to ${what}. Connecting requests your account address, not a token approval or signature.`}</p>
      <WalletButton />
    </div>
  );
}

export function useGate() {
  const { address, status } = useAccount();
  const chainId = useWalletChainId();
  return { address, chainId, connected: status === "connected" && !!address, deployed: !!deployment };
}

// ---------------------------------------------------------------------------
// Amount input with exact parsing (no floats) and max button
// ---------------------------------------------------------------------------

export function AmountField({ label, unit, value, onChange, max, disabled, id }: { label: string; unit: string; value: string; onChange: (v: string) => void; max?: bigint | null; disabled?: boolean; id: string }) {
  let error: string | null = null;
  let parsed: bigint | null = null;
  if (value.trim()) {
    try {
      parsed = parseAmount(value);
      if (parsed === 0n) error = "Enter an amount above zero.";
      else if (max !== undefined && max !== null && parsed > max) error = "More than your available balance.";
    } catch (e) {
      error = (e as Error).message;
    }
  }
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm text-ink-300">
          {label}
        </label>
        {max !== undefined && (
          <span className="text-xs text-ink-400">
            Available <span className="num text-ink-200">{max === null ? "—" : formatAmount(max, 18, 6)}</span>
          </span>
        )}
      </div>
      <div className={cn("mt-2 flex items-center rounded-sm border bg-ink-950 pr-2 transition-colors focus-within:border-ember-500", error ? "border-rust-500" : "border-ink-600")}>
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.0"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-err` : undefined}
          className="num h-14 min-w-0 flex-1 bg-transparent px-4 text-xl text-bone-50 outline-none placeholder:text-ink-500 disabled:text-ink-400"
        />
        <span className="mr-2 text-sm text-ink-300">{unit}</span>
        {max !== undefined && max !== null && max > 0n && (
          <button type="button" disabled={disabled} onClick={() => onChange(formatAmount(max, 18, 18).replace(/,/g, ""))} className="rounded-xs border border-ink-600 px-2 py-1 font-mono text-[0.625rem] uppercase tracking-[0.12em] text-ink-200 hover:border-ember-500 hover:text-ember-300">
            Max
          </button>
        )}
      </div>
      {error && (
        <p id={`${id}-err`} className="mt-2 text-xs text-rust-300" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function useAmount() {
  const [value, setValue] = useState("");
  let parsed: bigint | null = null;
  try {
    parsed = value.trim() ? parseAmount(value) : null;
  } catch {
    parsed = null;
  }
  return { value, setValue, parsed: parsed && parsed > 0n ? parsed : null };
}

// ---------------------------------------------------------------------------
// Step list for multi-transaction flows
// ---------------------------------------------------------------------------

export type FlowStep = { key: string; title: string; chain: "Mezo testnet" | "Base Sepolia"; detail?: ReactNode; state: TxState; done?: boolean; skipped?: boolean };

export function StepList({ steps }: { steps: FlowStep[] }) {
  return (
    <ol className="space-y-3">
      {steps.map((s, i) => {
        const p = s.state.phase;
        const tone = s.done ? "verified" : p === "failed" ? "failed" : p === "rejected" ? "neutral" : p === "idle" ? "neutral" : "pending";
        const chainExplorer = s.chain === "Mezo testnet" ? explorer.mezoTx : explorer.baseTx;
        return (
          <li key={s.key} className={cn("rounded-sm border p-4", s.done ? "border-sage-500/30 bg-sage-500/[0.04]" : "border-ink-700 bg-ink-850")}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="num grid h-7 w-7 shrink-0 place-items-center rounded-full border border-ink-600 text-xs text-ink-300">{i + 1}</span>
                <div>
                  <p className="text-sm font-medium text-bone-100">{s.title}</p>
                  <p className="text-xs text-ink-400">{s.chain}</p>
                </div>
              </div>
              <Chip tone={tone} pulse={["switching", "simulating", "signing", "pending"].includes(p)}>
                {s.skipped ? "Not needed" : s.done ? "Done" : phaseLabel[p]}
              </Chip>
            </div>
            {s.detail && <div className="mt-3 text-xs leading-relaxed text-ink-300">{s.detail}</div>}
            {s.state.hash && (
              <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-400">
                tx <Hash value={s.state.hash} href={chainExplorer(s.state.hash)} />
              </p>
            )}
            {s.state.error && (
              <p className="mt-3 text-xs leading-relaxed text-rust-300" role="alert">
                {s.state.error}
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function NetworkHint({ chainId }: { chainId: number }) {
  return <span className="text-xs text-ink-400">Runs on {chainId === MEZO_ID ? "Mezo testnet (gas in testnet BTC)" : "Base Sepolia (gas in Sepolia ETH)"}. Your wallet will be asked to switch if needed.</span>;
}

export function Busy({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-ink-300">
      <Spinner /> {children}
    </span>
  );
}

export { Button };
