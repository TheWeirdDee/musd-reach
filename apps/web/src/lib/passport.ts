import { getAddress, isAddress, toEventSelector, type Address, type Hex } from "viem";
import siteData from "@/generated/site-data.json";
import bonusList from "@/content/passport-bonus.json";

/**
 * Route passport. A Reach position travels Mezo → Base → Mezo, and every leg is a real
 * transaction proven by an on-chain event, so a passport is public and anyone can rebuild it from
 * this file and the chain. Logs come from the Mezo and Base Sepolia Blockscout APIs (any block
 * range, CORS-open). Stamps have no cash value.
 */

export type StampId = "kit" | "move" | "receipt" | "borrow" | "repay" | "lend" | "bridge" | "home" | "bug";
export type LegId = "mezo" | "base" | "home" | "inspector";
export type Leg = { id: LegId; n: string; name: string; where: string };
export type Stamp = { id: StampId; leg: LegId; title: string; how: string; href: string; proof: string };

export const LEGS: Leg[] = [
  { id: "mezo", n: "Leg 1", name: "Start on Mezo", where: "Mezo testnet" },
  { id: "base", n: "Leg 2", name: "Cross to Base", where: "Wormhole → Base Sepolia" },
  { id: "home", n: "Leg 3", name: "Come home to Mezo", where: "Base Sepolia → Mezo" },
  { id: "inspector", n: "Bonus", name: "Route inspector", where: "GitHub" },
];

export const STAMPS: Stamp[] = [
  { id: "kit", leg: "mezo", title: "Route kit received", how: "Get the free route kit on the Try it page. Your wallet can be empty.", href: "/start", proof: "Claimed on the Reach tester kit (Mezo)" },
  { id: "move", leg: "mezo", title: "Savings sent to Base", how: "Save MUSD on Mezo and send the receipt to Base.", href: "/app/portable/new", proof: "SharesLocked on the Reach source gateway (Mezo)" },
  { id: "receipt", leg: "base", title: "Receipt collected on Base", how: "Deliver the Wormhole-signed message from the tracker.", href: "/app/history", proof: "ReceiptMinted on the Reach destination gateway (Base)" },
  { id: "borrow", leg: "base", title: "Borrowed against savings", how: "Post rwSMUSD as collateral and borrow MUSD or USDC.", href: "/app/borrow", proof: "Morpho Borrow in a Reach market (Base)" },
  { id: "repay", leg: "base", title: "Loan repaid", how: "Pay back some or all of a loan.", href: "/app/borrow", proof: "Morpho Repay in a Reach market (Base)" },
  { id: "lend", leg: "base", title: "Lent to Mezo savers", how: "Deposit MUSD or USDC into a Reach vault.", href: "/app/lend", proof: "Deposit on a Reach vault (Base)" },
  { id: "bridge", leg: "home", title: "MUSD over Mezo's bridge", how: "Move MUSD between Mezo and Base on Mezo's own bridge.", href: "/app/bridge", proof: "MUSD sent into Mezo's NTT bridge (Mezo or Base)" },
  { id: "home", leg: "home", title: "Savings back home", how: "Hand back rwSMUSD and get your savings back on Mezo.", href: "/app/redeem", proof: "ReceiptBurned on the Reach destination gateway (Base)" },
  { id: "bug", leg: "inspector", title: "Found a real bug", how: "Open a GitHub issue with steps to reproduce, or a refusal that failed on the Attack the bridge page. The team adds the stamp once confirmed.", href: "https://github.com/TheWeirdDee/musd-reach/issues/new", proof: "Listed in src/content/passport-bonus.json with the issue link" },
];

export const ROUTE_STAMPS = STAMPS.filter((s) => s.leg !== "inspector").length;

/** How far along the route a wallet has travelled: the furthest leg with a stamp, and whether every route stamp is in. */
export function routeStage(done: StampId[]): { label: string; legIndex: number } {
  const legs = new Set(done.map((id) => STAMPS.find((s) => s.id === id)!.leg));
  const route = done.filter((id) => id !== "bug").length;
  if (route === ROUTE_STAMPS) return { label: "Full route", legIndex: 4 };
  if (legs.has("home")) return { label: "Home to Mezo", legIndex: 3 };
  if (legs.has("base")) return { label: "On Base", legIndex: 2 };
  if (legs.has("mezo")) return { label: "On Mezo", legIndex: 1 };
  return { label: "Not on the route yet", legIndex: 0 };
}

/** Wallets the team controls. Shown with a "team" label and left off the leaderboard. */
export const TEAM: Address[] = [
  "0x90f08c7A949950AA11cF5D64948e9d59b798f1E0", // operator: deployer, curator, treasury
  "0xA70d71E11310962Cc590388baf2A52206a49606B", // NAV keeper
  "0xd4A6960b2aE32CEfcAC26586029c4e19a85a6259", // tester-kit relayer
  "0x0F579957D94D1D12Fbb0dE3A495180629098Efe6", // v2 deployer
];
const isTeam = (a: Address) => TEAM.some((t) => t.toLowerCase() === a.toLowerCase());

type Bonus = { address: string; reason: string; link?: string };
const bonuses = (bonusList as Bonus[]).filter((b) => isAddress(b.address));

const MEZO_API = "https://api.explorer.test.mezo.org/api";
const BASE_API = "https://base-sepolia.blockscout.com/api";

const sd = siteData as unknown as {
  deployment?: { sourceGateway?: Address; destinationGateway?: Address; sourceDeployBlock?: number; destinationDeployBlock?: number } | null;
  markets?: { morpho: Address; marketId: Hex; vault: Address; deployBlock: number | string } | null;
  marketsMusd?: { morpho: Address; marketId: Hex; vault: Address; deployBlock: number | string } | null;
  starterKit?: { starterKit: Address; deployBlock: number } | null;
  testerKits?: { mezo?: { testerKit: Address; deployBlock: number } | null } | null;
};

const T = {
  oldKitClaimed: toEventSelector("Claimed(address,uint256,uint256)"),
  kitClaimed: toEventSelector("Claimed(address,uint256,uint256,uint256)"),
  sharesLocked: toEventSelector("SharesLocked(bytes32,address,address,uint256,uint64,uint64)"),
  receiptMinted: toEventSelector("ReceiptMinted(bytes32,address,uint256)"),
  receiptBurned: toEventSelector("ReceiptBurned(bytes32,address,address,uint256,uint8,uint64,uint64)"),
  borrow: toEventSelector("Borrow(bytes32,address,address,address,uint256,uint256)"),
  repay: toEventSelector("Repay(bytes32,address,address,uint256,uint256)"),
  deposit: toEventSelector("Deposit(address,address,uint256,uint256)"),
  transfer: toEventSelector("Transfer(address,address,uint256)"),
};

const MEZO_MUSD = "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503";
const MEZO_NTT = "0x20888B20e2F5F405d44261dA96467a1b1acE15be";
const BASE_MUSD = "0x560985f804De8187E8FBA94F7127Bc4c0e54AEA5";
const BASE_NTT = "0x6590DFF6abEd7C077839E8227A4f12Ec90E6D85F";

const pad = (a: string) => "0x" + a.toLowerCase().replace(/^0x/, "").padStart(64, "0");
const topicAddress = (t: string | null | undefined): Address | null => (t && t.length === 66 ? getAddress("0x" + t.slice(26)) : null);

type Log = { topics: (string | null)[] };
type Source = { stamp: StampId; api: string; address: string; fromBlock: number; topic0: string; filter?: Record<string, string>; who: 1 | 2 | 3 };

async function logs(s: Source): Promise<Log[]> {
  const q = new URLSearchParams({ module: "logs", action: "getLogs", address: s.address, fromBlock: String(s.fromBlock), toBlock: "latest", topic0: s.topic0 });
  for (const [k, v] of Object.entries(s.filter ?? {})) {
    q.set(k, v);
    q.set(`topic0_${k.slice(5)}_opr`, "and");
  }
  const res = await fetch(`${s.api}?${q}`, { signal: AbortSignal.timeout(25_000), cache: "no-store" });
  if (!res.ok) throw new Error(`explorer ${res.status}`);
  const j = (await res.json()) as { status?: string; message?: string; result?: Log[] | string };
  if (Array.isArray(j.result)) return j.result;
  if (j.message === "No logs found" || (typeof j.result === "string" && /no logs/i.test(j.result))) return [];
  throw new Error(`explorer: ${j.message ?? "unexpected reply"}`);
}

function sources(): Source[] {
  const d = sd.deployment;
  const out: Source[] = [];
  if (sd.testerKits?.mezo) out.push({ stamp: "kit", api: MEZO_API, address: sd.testerKits.mezo.testerKit, fromBlock: sd.testerKits.mezo.deployBlock, topic0: T.kitClaimed, who: 1 });
  if (sd.starterKit) out.push({ stamp: "kit", api: MEZO_API, address: sd.starterKit.starterKit, fromBlock: sd.starterKit.deployBlock, topic0: T.oldKitClaimed, who: 1 });
  if (d?.sourceGateway) out.push({ stamp: "move", api: MEZO_API, address: d.sourceGateway, fromBlock: d.sourceDeployBlock ?? 0, topic0: T.sharesLocked, who: 2 });
  if (d?.destinationGateway) {
    out.push({ stamp: "receipt", api: BASE_API, address: d.destinationGateway, fromBlock: d.destinationDeployBlock ?? 0, topic0: T.receiptMinted, who: 2 });
    out.push({ stamp: "home", api: BASE_API, address: d.destinationGateway, fromBlock: d.destinationDeployBlock ?? 0, topic0: T.receiptBurned, who: 2 });
  }
  for (const m of [sd.markets, sd.marketsMusd]) {
    if (!m) continue;
    const from = Number(m.deployBlock);
    out.push({ stamp: "borrow", api: BASE_API, address: m.morpho, fromBlock: from, topic0: T.borrow, filter: { topic1: m.marketId }, who: 2 });
    out.push({ stamp: "repay", api: BASE_API, address: m.morpho, fromBlock: from, topic0: T.repay, filter: { topic1: m.marketId }, who: 3 });
    out.push({ stamp: "lend", api: BASE_API, address: m.vault, fromBlock: from, topic0: T.deposit, who: 2 });
  }
  // MUSD sent into Mezo's NTT bridge: transferred to the NttManager on either chain.
  out.push({ stamp: "bridge", api: MEZO_API, address: MEZO_MUSD, fromBlock: d?.sourceDeployBlock ?? 0, topic0: T.transfer, filter: { topic2: pad(MEZO_NTT) }, who: 1 });
  const baseFrom = Number(sd.marketsMusd?.deployBlock ?? sd.markets?.deployBlock ?? 0);
  out.push({ stamp: "bridge", api: BASE_API, address: BASE_MUSD, fromBlock: baseFrom, topic0: T.transfer, filter: { topic2: pad(BASE_NTT) }, who: 1 });
  return out;
}


export type Passport = { address: Address; done: StampId[]; stage: { label: string; legIndex: number }; bonus: Bonus[]; team: boolean };
export type PassportBoard = { wallets: Passport[]; asOf: number; failed: StampId[] };

/** Every wallet's stamps, read from chain events. A source that fails is reported, not guessed. */
export async function readPassports(): Promise<PassportBoard> {
  const byWallet = new Map<string, Set<StampId>>();
  const failed = new Set<StampId>();
  await Promise.all(
    sources().map(async (s) => {
      try {
        for (const l of await logs(s)) {
          const a = topicAddress(l.topics[s.who]);
          if (!a || /^0x0{40}$/i.test(a)) continue;
          const k = a.toLowerCase();
          if (!byWallet.has(k)) byWallet.set(k, new Set());
          byWallet.get(k)!.add(s.stamp);
        }
      } catch {
        failed.add(s.stamp);
      }
    }),
  );
  for (const b of bonuses) {
    const k = b.address.toLowerCase();
    if (!byWallet.has(k)) byWallet.set(k, new Set());
    byWallet.get(k)!.add("bug");
  }
  const wallets = [...byWallet.entries()].map(([k, set]) => {
    const address = getAddress(k);
    const done = STAMPS.map((s) => s.id).filter((id) => set.has(id));
    return { address, done, stage: routeStage(done), bonus: bonuses.filter((b) => b.address.toLowerCase() === k), team: isTeam(address) };
  });
  // Furthest along the route first, then most stamps.
  wallets.sort((a, b) => b.stage.legIndex - a.stage.legIndex || b.done.length - a.done.length || a.address.localeCompare(b.address));
  return { wallets, asOf: Date.now(), failed: [...failed] };
}
