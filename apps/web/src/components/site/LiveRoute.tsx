"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useClients } from "@/lib/hooks";
import { useMezoSigning } from "@/lib/wormholeHealth";
import { cn } from "@/lib/cn";

type Tone = "ok" | "wait" | "bad" | "unknown";
const dot: Record<Tone, string> = { ok: "bg-sage-400", wait: "bg-sand-400", bad: "bg-rust-400", unknown: "bg-ink-500" };

function Node({ name, line, tone }: { name: string; line: string; tone: Tone }) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-2 text-sm font-medium text-bone-50">
        <span className="relative flex h-2 w-2" aria-hidden>
          {tone === "ok" && <span className="absolute inline-flex h-full w-full rounded-full bg-sage-400 opacity-60 motion-safe:animate-ping" />}
          <span className={cn("relative inline-flex h-2 w-2 rounded-full", dot[tone])} />
        </span>
        {name}
      </p>
      <p className="num mt-0.5 truncate text-xs text-ink-400">{line}</p>
    </div>
  );
}

/** The Reach route, live: both chains' latest blocks and whether Wormhole is signing Mezo messages. */
export function LiveRoute({ compact = false }: { compact?: boolean }) {
  const clients = useClients();
  const heads = useQuery({
    queryKey: ["footer-heads"],
    enabled: !!clients,
    refetchInterval: 20_000,
    retry: 1,
    queryFn: async () => {
      const [m, b] = await Promise.allSettled([clients!.mezo.getBlockNumber(), clients!.base.getBlockNumber()]);
      return { mezo: m.status === "fulfilled" ? m.value : null, base: b.status === "fulfilled" ? b.value : null };
    },
  });
  const sig = useMezoSigning();
  const h = heads.data;
  const block = (n: bigint | null | undefined) => (n == null ? (heads.isPending ? "reading…" : "unreachable") : `block ${n.toLocaleString("en-US")}`);
  const chainTone = (n: bigint | null | undefined): Tone => (n == null ? (heads.isPending ? "unknown" : "bad") : "ok");
  const wTone: Tone = !sig.data ? "unknown" : sig.data.state === "signing" ? "ok" : sig.data.state === "waiting" ? "wait" : "bad";
  const wLine = !sig.data ? (sig.isError ? "status unavailable" : "reading…") : sig.data.state === "signing" ? "signing, nothing waiting" : sig.data.state === "waiting" ? "signing in progress" : "signing delayed";
  const arrow = <span aria-hidden className="hidden text-ink-600 sm:block">→</span>;
  return (
    <div className={cn("grid items-center gap-4 sm:grid-cols-[1fr_auto_1fr_auto_1fr]", compact ? "" : "rounded-md border border-ink-700 bg-ink-900/50 p-5")} aria-label="Live route status">
      <Node name="Mezo testnet" line={`savings · ${block(h?.mezo)}`} tone={chainTone(h?.mezo)} />
      {arrow}
      <Link href="/status#wormhole" className="rounded-sm outline-offset-4 hover:opacity-90">
        <Node name="Wormhole" line={wLine} tone={wTone} />
      </Link>
      {arrow}
      <Node name="Base Sepolia" line={`markets · ${block(h?.base)}`} tone={chainTone(h?.base)} />
    </div>
  );
}
