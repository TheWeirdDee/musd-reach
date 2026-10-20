import { type Address, type Hex, toHex, base64ToBytes } from "./internal";
import { addressToBytes32 } from "./messages";

export type SignedVaaResult =
  | { status: "signed"; vaa: Hex; source: "wormholescan" }
  | { status: "pending" }
  | { status: "error"; error: string };

/**
 * Fetches a guardian-signed VAA from the Wormholescan API. The API is only a transport:
 * Reach contracts verify the guardian signatures on-chain, so a malicious API response
 * cannot mint or release anything.
 */
export async function fetchSignedVaa(opts: {
  api: string;
  emitterChainId: number;
  emitter: Address;
  sequence: bigint;
  fetchImpl?: typeof fetch;
}): Promise<SignedVaaResult> {
  const f = opts.fetchImpl ?? fetch;
  const emitter = addressToBytes32(opts.emitter).slice(2);
  const url = `${opts.api.replace(/\/$/, "")}/api/v1/vaas/${opts.emitterChainId}/${emitter}/${opts.sequence}`;
  try {
    const res = await f(url, { headers: { accept: "application/json" } });
    if (res.status === 404) return { status: "pending" };
    if (!res.ok) return { status: "error", error: `wormholescan HTTP ${res.status}` };
    const body = (await res.json()) as { data?: { vaa?: string } };
    if (!body.data?.vaa) return { status: "pending" };
    return { status: "signed", vaa: toHex(base64ToBytes(body.data.vaa)), source: "wormholescan" };
  } catch (e) {
    return { status: "error", error: (e as Error).message };
  }
}

/** Polls until the VAA is signed or the deadline passes. */
export async function waitForSignedVaa(opts: Parameters<typeof fetchSignedVaa>[0] & {
  timeoutMs?: number;
  intervalMs?: number;
  onPoll?: (attempt: number, last: SignedVaaResult) => void;
}): Promise<SignedVaaResult> {
  const deadline = Date.now() + (opts.timeoutMs ?? 30 * 60_000);
  let attempt = 0;
  let last: SignedVaaResult = { status: "pending" };
  while (Date.now() < deadline) {
    attempt++;
    last = await fetchSignedVaa(opts);
    opts.onPoll?.(attempt, last);
    if (last.status === "signed") return last;
    await new Promise((r) => setTimeout(r, opts.intervalMs ?? 15_000));
  }
  return last;
}
