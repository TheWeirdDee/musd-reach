"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatUnits, parseAbi, type Address } from "viem";
import { Button, Notice } from "@/components/ui/primitives";
import { useClients } from "@/lib/hooks";
import { explorer } from "@/lib/reach";
import { testerKits } from "@/lib/markets";
import { pushToast } from "@/lib/toasts";

const kitAbi = parseAbi(["function claimed(address) view returns (bool)", "function kitsAvailableToday() view returns (uint256)"]);

type ChainResult = { status: "sent" | "already" | "none_left" | "unavailable" | "error"; hash?: `0x${string}` };
type KitResponse = { ok: boolean; code?: "bad_address" | "slow_down" | "unavailable"; mezo?: ChainResult; base?: ChainResult };

const amount = (wei: string | number, places = 5) => Number(formatUnits(BigInt(wei), 18)).toLocaleString("en-US", { maximumFractionDigits: places });

/**
 * Free tester kit, sent by Reach's relayer, so a tester needs no tokens at all to start: test MUSD
 * and a little BTC for gas on Mezo, and a little ETH for gas on Base. One kit per wallet.
 */
export function RouteKitClaim({ address }: { address?: Address }) {
  const c = useClients();
  const qc = useQueryClient();
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<KitResponse | null>(null);
  const mk = testerKits.mezo;
  const bk = testerKits.base;
  const state = useQuery({
    queryKey: ["tester-kit", address],
    enabled: !!c && !!address && !!mk,
    refetchInterval: 20_000,
    queryFn: async () => {
      const [mezoClaimed, mezoLeft, baseClaimed] = await Promise.all([
        c!.mezo.readContract({ address: mk!.testerKit, abi: kitAbi, functionName: "claimed", args: [address!] }),
        c!.mezo.readContract({ address: mk!.testerKit, abi: kitAbi, functionName: "kitsAvailableToday" }),
        bk ? c!.base.readContract({ address: bk.testerKit, abi: kitAbi, functionName: "claimed", args: [address!] }) : Promise.resolve(true),
      ]);
      return { mezoClaimed, mezoLeft, baseClaimed };
    },
  });
  if (!mk) return null;
  const musd = amount(mk.tokenPerKit, 0);
  const btc = amount(mk.nativePerKit);
  const eth = bk ? amount(bk.nativePerKit) : null;
  const what = `${musd} test MUSD + ${btc} BTC for gas on Mezo${eth ? `, and ${eth} ETH for gas on Base` : ""}`;
  if (!address) return <p className="mt-2 text-xs text-ink-400">Connect a wallet to get {what}. Your wallet can be empty.</p>;
  const s = state.data;
  const both = !!s && s.mezoClaimed && s.baseClaimed;

  async function claim() {
    setSending(true);
    setResult(null);
    try {
      const r = await fetch("/api/route-kit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address }) });
      const body = (await r.json()) as KitResponse;
      setResult(body);
      if (body.mezo?.status === "sent" || body.base?.status === "sent") {
        pushToast({ kind: "done", title: "Route kit on its way", body: `${what}. It lands in a few seconds.`, href: body.mezo?.hash ? explorer.mezoTx(body.mezo.hash) : body.base?.hash ? explorer.baseTx(body.base.hash) : undefined });
      }
      setTimeout(() => qc.invalidateQueries({ queryKey: ["tester-kit"] }), 8_000);
    } catch {
      setResult({ ok: false, code: "unavailable" });
    } finally {
      setSending(false);
    }
  }

  const err = result && !result.ok ? (result.code === "slow_down" ? "Too many tries from this connection. Wait ten minutes and try again." : result.code === "bad_address" ? "That wallet address isn't valid." : result.mezo?.status === "none_left" ? "Today's kits are all claimed. More open at 00:00 UTC." : "The kit service is unavailable right now. Try again in a minute.") : null;

  return (
    <div className="mt-3 space-y-2">
      {both ? (
        <Notice tone="verified" title="Route kit received">
          {what} {result?.mezo?.hash && <> · <a className="underline underline-offset-4" href={explorer.mezoTx(result.mezo.hash)} target="_blank" rel="noreferrer">Mezo transaction</a></>}
          {result?.base?.hash && <> · <a className="underline underline-offset-4" href={explorer.baseTx(result.base.hash)} target="_blank" rel="noreferrer">Base transaction</a></>}
        </Notice>
      ) : (
        <>
          <Button busy={sending} disabled={sending || !s || (s.mezoLeft === 0n && !s.mezoClaimed)} onClick={claim}>
            {!s ? "Checking…" : s.mezoLeft === 0n && !s.mezoClaimed ? "Today's kits are gone: try tomorrow" : sending ? "Sending your kit…" : "Get my free route kit"}
          </Button>
          <p className="text-xs text-ink-400">
            {what}. Sent by Reach, so your wallet can be empty: no gas, no signature. One kit per wallet{s ? `; ${s.mezoLeft.toString()} left today` : ""}.
          </p>
          {result?.ok && <p className="text-xs text-sage-300">Sent. It lands in a few seconds; this card updates by itself.</p>}
          {err && <p className="text-xs text-rust-300">{err}</p>}
        </>
      )}
    </div>
  );
}
