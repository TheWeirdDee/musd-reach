import { createPublicClient, createWalletClient, defineChain, getAddress, http, isAddress, parseAbi, type Address, type Hash } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { gasLimitFor } from "@musd-reach/sdk";
import siteData from "@/generated/site-data.json";
import { reachConfig } from "@/lib/reach";

/**
 * POST /api/route-kit  { "address": "0x…" }
 *
 * Sends a tester kit to a wallet on both chains, paid by Reach's relayer, so a tester can start with
 * an empty wallet: test MUSD plus a little BTC for gas on Mezo, and a little ETH for gas on Base.
 *
 * The relayer key (REACH_RELAYER_KEY) is read here and nowhere else, and is never logged. It can
 * only call `claimFor` on the two ReachTesterKit contracts, which enforce one kit per address,
 * a daily limit and hard caps on every kit, so a leaked key or a flood of new addresses can never
 * take more than a capped day's worth. This route adds a per-IP limit on top.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const kitAbi = parseAbi([
  "function claimFor(address to)",
  "function claimed(address) view returns (bool)",
  "function kitsAvailableToday() view returns (uint256)",
]);

type Kit = { chainId: number; testerKit: Address };
const kits = (siteData as unknown as { testerKits?: { mezo?: Kit | null; base?: Kit | null } }).testerKits ?? {};

const mezo = defineChain({
  id: 31611,
  name: "Mezo Testnet",
  nativeCurrency: { name: "Bitcoin", symbol: "BTC", decimals: 18 },
  rpcUrls: { default: { http: [...reachConfig.mezo.rpcUrls] } },
});
const base = { ...baseSepolia, rpcUrls: { default: { http: [...reachConfig.base.rpcUrls] } } };

export type ChainResult = { status: "sent" | "already" | "none_left" | "unavailable" | "error"; hash?: Hash };
export type KitResponse = { ok: boolean; code?: "bad_address" | "slow_down" | "unavailable"; mezo?: ChainResult; base?: ChainResult };

// Per-IP limit: a few tries per 10 minutes. One server instance's memory; the contracts are the real limit.
const WINDOW_MS = 10 * 60_000;
const PER_WINDOW = 4;
const hits = new Map<string, number[]>();
function tooMany(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5_000) hits.clear();
  return recent.length > PER_WINDOW;
}

// One relayer send at a time per chain, so parallel requests never reuse a nonce.
const queues = new Map<number, Promise<unknown>>();
function serial<T>(chainId: number, job: () => Promise<T>): Promise<T> {
  const prev = queues.get(chainId) ?? Promise.resolve();
  const next = prev.then(job, job);
  queues.set(chainId, next.catch(() => {}));
  return next;
}

async function sendKit(chain: typeof mezo | typeof base, kit: Kit | null | undefined, to: Address, key: `0x${string}`): Promise<ChainResult> {
  if (!kit) return { status: "unavailable" };
  const pub = createPublicClient({ chain, transport: http(undefined, { retryCount: 3, timeout: 20_000 }) });
  try {
    if (await pub.readContract({ address: kit.testerKit, abi: kitAbi, functionName: "claimed", args: [to] })) return { status: "already" };
    if ((await pub.readContract({ address: kit.testerKit, abi: kitAbi, functionName: "kitsAvailableToday" })) === 0n) return { status: "none_left" };
    const account = privateKeyToAccount(key);
    const wallet = createWalletClient({ chain, account, transport: http(undefined, { retryCount: 2, timeout: 20_000 }) });
    return await serial(chain.id, async () => {
      // Simulate first: a refusal costs the relayer nothing.
      await pub.simulateContract({ address: kit.testerKit, abi: kitAbi, functionName: "claimFor", args: [to], account });
      const estimate = await pub.estimateContractGas({ address: kit.testerKit, abi: kitAbi, functionName: "claimFor", args: [to], account });
      const hash = await wallet.writeContract({ address: kit.testerKit, abi: kitAbi, functionName: "claimFor", args: [to], gas: gasLimitFor(chain.id, estimate) });
      return { status: "sent" as const, hash };
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (/AlreadyClaimed/.test(msg)) return { status: "already" };
    if (/DailyLimitReached|KitEmpty|ClaimsPaused/.test(msg)) return { status: "none_left" };
    console.error(`[route-kit] chain ${chain.id} send failed for ${to}: ${msg.split("\n")[0]}`);
    return { status: "error" };
  }
}

export async function POST(request: Request): Promise<Response> {
  const json = (body: KitResponse, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
  let raw: unknown;
  try {
    raw = (await request.json()) as unknown;
  } catch {
    return json({ ok: false, code: "bad_address" }, 400);
  }
  const input = typeof raw === "object" && raw !== null ? (raw as { address?: unknown }).address : undefined;
  if (typeof input !== "string" || !isAddress(input) || /^0x0{40}$/i.test(input)) return json({ ok: false, code: "bad_address" }, 400);
  const to = getAddress(input);

  const ip = request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (tooMany(ip)) return json({ ok: false, code: "slow_down" }, 429);

  const key = process.env.REACH_RELAYER_KEY;
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) return json({ ok: false, code: "unavailable" }, 503);

  const [m, b] = await Promise.all([sendKit(mezo, kits.mezo, to, key as `0x${string}`), sendKit(base, kits.base, to, key as `0x${string}`)]);
  console.log(`[route-kit] ${to} mezo=${m.status} base=${b.status}`);
  return json({ ok: m.status === "sent" || b.status === "sent" || (m.status === "already" && b.status === "already"), mezo: m, base: b });
}
