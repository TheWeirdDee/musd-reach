"use client";

import { useQuery } from "@tanstack/react-query";
import { parseAbi, parseAbiItem, type Address } from "viem";
import { useClients } from "./hooks";
import { deployment, reachConfig } from "./reach";
import { bridgeSides } from "./mezoBridge";
import { WORMHOLESCAN_API } from "./csp";

const coreAbi = parseAbi(["function nextSequence(address emitter) view returns (uint64)"]);
const logMessagePublished = parseAbiItem("event LogMessagePublished(address indexed sender, uint64 sequence, uint32 nonce, bytes payload, uint8 consistencyLevel)");
/** Mezo's public RPC serves at most 10,000 blocks of logs per request (about 10 hours). */
const LOG_WINDOW = 9_999n;
const MEZO_WORMHOLE_CHAIN = 50;
/** Mezo testnet messages normally finalize and get signed within minutes. */
const DELAYED_AFTER_MS = 45 * 60_000;

export type EmitterHealth = { label: string; emitter: Address; published: bigint; signed: bigint; lastSignedAt: number | null };
/** oldestWaitingAt: when the oldest unsigned message was published; null with waiting > 0 means "over ~10 hours ago". */
export type MezoSigning = { emitters: EmitterHealth[]; waiting: bigint; lastSignedAt: number | null; oldestWaitingAt: number | null; state: "signing" | "waiting" | "delayed" };

const pad = (a: string) => a.toLowerCase().replace(/^0x/, "").padStart(64, "0");

/**
 * Is Wormhole's testnet guardian signing messages from Mezo? For each Mezo emitter Reach depends on
 * (the Reach source gateway and Mezo's MUSD bridge transceiver) this compares the sequence the Mezo
 * Wormhole Core has handed out with the latest sequence Wormholescan has a signed VAA for.
 * Messages "waiting" for a short while is normal; waiting with no signature for 45 minutes is "delayed".
 */
export function useMezoSigning() {
  const clients = useClients();
  const core = reachConfig.mezo.wormholeCore as Address | undefined;
  const emitters: { label: string; emitter: Address }[] = [
    ...(deployment?.sourceGateway ? [{ label: "Reach gateway (savings → Base)", emitter: deployment.sourceGateway as Address }] : []),
    { label: "Mezo MUSD bridge (MUSD → Base)", emitter: bridgeSides.mezo.transceiver },
  ];
  return useQuery({
    queryKey: ["mezo-signing", emitters.map((e) => e.emitter).join()],
    enabled: !!clients && !!core,
    refetchInterval: 60_000,
    retry: 1,
    queryFn: async (): Promise<MezoSigning> => {
      const rows = await Promise.all(
        emitters.map(async ({ label, emitter }) => {
          const [published, res] = await Promise.all([
            clients!.mezo.readContract({ address: core!, abi: coreAbi, functionName: "nextSequence", args: [emitter] }),
            fetch(`${WORMHOLESCAN_API}/api/v1/vaas/${MEZO_WORMHOLE_CHAIN}/${pad(emitter)}?pageSize=1`, { signal: AbortSignal.timeout(20_000) }),
          ]);
          if (!res.ok && res.status !== 404) throw new Error(`Wormholescan responded ${res.status}`);
          const body = res.ok ? ((await res.json()) as { data?: { sequence: number | string; timestamp: string }[] }) : {};
          const latest = body.data?.[0];
          return { label, emitter, published, signed: latest ? BigInt(latest.sequence) + 1n : 0n, lastSignedAt: latest ? Date.parse(latest.timestamp) : null };
        }),
      );
      const waiting = rows.reduce((n, r) => n + (r.published > r.signed ? r.published - r.signed : 0n), 0n);
      const lastSignedAt = rows.reduce<number | null>((t, r) => (r.lastSignedAt && (!t || r.lastSignedAt > t) ? r.lastSignedAt : t), null);
      // When was the oldest unsigned message published? Search the last ~10 hours of Mezo logs.
      let oldestWaitingAt: number | null = null;
      const behind = rows.filter((r) => r.published > r.signed);
      if (behind.length) {
        const head = await clients!.mezo.getBlockNumber();
        for (const r of behind) {
          const logs = await clients!.mezo.getLogs({ address: core!, event: logMessagePublished, args: { sender: r.emitter }, fromBlock: head - LOG_WINDOW, toBlock: head });
          const first = logs.find((l) => l.args.sequence === r.signed);
          if (!first) { oldestWaitingAt = null; break; } // older than the window
          const b = await clients!.mezo.getBlock({ blockNumber: first.blockNumber });
          const t = Number(b.timestamp) * 1000;
          oldestWaitingAt = oldestWaitingAt === null ? t : Math.min(oldestWaitingAt, t);
        }
      }
      const state = waiting === 0n ? "signing" : oldestWaitingAt !== null && Date.now() - oldestWaitingAt < DELAYED_AFTER_MS ? "waiting" : "delayed";
      return { emitters: rows, waiting, lastSignedAt, oldestWaitingAt, state };
    },
  });
}

export function ago(ms: number) {
  const m = Math.max(0, Math.round((Date.now() - ms) / 60_000));
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h} h ${m % 60} min ago` : `${Math.floor(h / 24)} days ago`;
}
