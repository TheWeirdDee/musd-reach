import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  encodePacked,
  http,
  keccak256,
  parseAbiItem,
  toHex,
  concat,
  numberToHex,
  type Address,
  type Hex,
  type PublicClient,
  type TransactionReceipt,
  type WalletClient,
} from "viem";
import { privateKeyToAccount, sign, type PrivateKeyAccount } from "viem/accounts";
import { buildConfig, waitForSignedVaa, addressToBytes32, type ReachConfig } from "@musd-reach/sdk";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export type Mode = "fork" | "testnet";

export const logMessagePublished = parseAbiItem(
  "event LogMessagePublished(address indexed sender, uint64 sequence, uint32 nonce, bytes payload, uint8 consistencyLevel)",
);

export type Env = {
  mode: Mode;
  cfg: ReachConfig;
  mezo: PublicClient;
  base: PublicClient;
  mezoWallet: (a: PrivateKeyAccount) => WalletClient;
  baseWallet: (a: PrivateKeyAccount) => WalletClient;
  /** Fork mode only: key written into each forked Core's guardian set. */
  localGuardianKey?: Hex;
};

export function loadDeployments(mode: Mode): Record<string, string | number> | null {
  const p =
    mode === "fork"
      ? process.env.REACH_DEPLOYMENTS ?? ""
      : join(ROOT, "deployments", "testnet.json");
  if (!p || !existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8"));
}

export function makeEnv(mode: Mode): Env {
  const deployments = loadDeployments(mode);
  const mezoRpc = mode === "fork" ? "http://127.0.0.1:8545" : process.env.MEZO_TESTNET_RPC ?? "https://rpc.test.mezo.org";
  const baseRpc = mode === "fork" ? "http://127.0.0.1:8546" : process.env.BASE_SEPOLIA_RPC ?? "https://sepolia.base.org";
  const cfg = buildConfig({ deployments, mezoRpcUrls: [mezoRpc], baseRpcUrls: [baseRpc] });
  const mezo = createPublicClient({ chain: cfg.mezo.chain, transport: http(mezoRpc, { timeout: 60_000 }) }) as PublicClient;
  const base = createPublicClient({ chain: cfg.base.chain, transport: http(baseRpc, { timeout: 60_000 }) }) as PublicClient;
  return {
    mode,
    cfg,
    mezo,
    base,
    mezoWallet: (account) => createWalletClient({ account, chain: cfg.mezo.chain, transport: http(mezoRpc, { timeout: 60_000 }) }),
    baseWallet: (account) => createWalletClient({ account, chain: cfg.base.chain, transport: http(baseRpc, { timeout: 60_000 }) }),
    localGuardianKey: mode === "fork" ? (process.env.REACH_FORK_GUARDIAN_KEY as Hex | undefined) : undefined,
  };
}

/** Loads a signing key from REACH_PRIVATE_KEY_FILE (preferred) or REACH_PRIVATE_KEY. Never logged. */
export function loadAccount(fileVar: string, envVar: string): PrivateKeyAccount {
  const file = process.env[fileVar];
  let key = file ? readFileSync(file, "utf8").trim() : process.env[envVar]?.trim();
  if (!key) throw new Error(`Set ${fileVar} (path to a key file) or ${envVar}`);
  if (!key.startsWith("0x")) key = `0x${key}`;
  return privateKeyToAccount(key as Hex);
}

// ---------------------------------------------------------------------------
// Fork-only guardian override (mirrors wormhole-solidity-sdk WormholeOverride)
// ---------------------------------------------------------------------------

export async function overrideForkGuardian(client: PublicClient, core: Address, guardian: Address) {
  const slot3 = await client.getStorageAt({ address: core, slot: numberToHex(3, { size: 32 }) });
  const index = BigInt(slot3 ?? "0x0") & 0xffffffffn;
  const setSlot = keccak256(encodePacked(["uint256", "uint256"], [index, 2n]));
  const elemSlot = keccak256(setSlot);
  await client.request({ method: "anvil_setStorageAt" as never, params: [core, setSlot, numberToHex(1, { size: 32 })] as never });
  await client.request({
    method: "anvil_setStorageAt" as never,
    params: [core, elemSlot, `0x${guardian.slice(2).toLowerCase().padStart(64, "0")}`] as never,
  });
  return Number(index);
}

export type PublishedMessage = { emitter: Address; sequence: bigint; nonce: number; payload: Hex; consistencyLevel: number; blockTimestamp: bigint };

export async function publishedFrom(client: PublicClient, receipt: TransactionReceipt, core: Address): Promise<PublishedMessage> {
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== core.toLowerCase()) continue;
    try {
      const ev = decodeEventLog({ abi: [logMessagePublished], data: log.data, topics: log.topics });
      const block = await client.getBlock({ blockNumber: receipt.blockNumber });
      return {
        emitter: ev.args.sender,
        sequence: ev.args.sequence,
        nonce: ev.args.nonce,
        payload: ev.args.payload,
        consistencyLevel: ev.args.consistencyLevel,
        blockTimestamp: block.timestamp,
      };
    } catch {
      continue;
    }
  }
  throw new Error(`no LogMessagePublished from ${core} in ${receipt.transactionHash}`);
}

/** Fork mode: sign locally with the overridden guardian. Testnet: fetch the guardian-signed VAA. */
export async function obtainVaa(env: Env, emitterChainId: number, msg: PublishedMessage, gsIndex = 0): Promise<{ vaa: Hex; source: string }> {
  if (env.mode === "fork") {
    if (!env.localGuardianKey) throw new Error("REACH_FORK_GUARDIAN_KEY not set");
    const body = encodePacked(
      ["uint32", "uint32", "uint16", "bytes32", "uint64", "uint8", "bytes"],
      [Number(msg.blockTimestamp), msg.nonce, emitterChainId, addressToBytes32(msg.emitter), msg.sequence, msg.consistencyLevel, msg.payload],
    );
    const digest = keccak256(keccak256(body));
    const sig = await sign({ hash: digest, privateKey: env.localGuardianKey });
    const recid = Number(sig.yParity ?? (sig.v! - 27n));
    const vaa = concat([
      toHex(1, { size: 1 }),
      toHex(gsIndex, { size: 4 }),
      toHex(1, { size: 1 }),
      toHex(0, { size: 1 }),
      sig.r,
      sig.s,
      toHex(recid, { size: 1 }),
      body,
    ]);
    return { vaa, source: "LOCAL FORK GUARDIAN (rehearsal only)" };
  }
  const res = await waitForSignedVaa({
    api: env.cfg.wormhole.api,
    emitterChainId,
    emitter: msg.emitter,
    sequence: msg.sequence,
    timeoutMs: 60 * 60_000,
    intervalMs: 20_000,
    onPoll: (n, last) => n % 3 === 1 && console.log(`  waiting for guardian signature (attempt ${n}, ${last.status})`),
  });
  if (res.status !== "signed") throw new Error(`VAA not available: ${JSON.stringify(res)}`);
  return { vaa: res.vaa, source: `${env.cfg.wormhole.api} (guardian-signed)` };
}

export function writeEvidence(relPath: string, data: unknown) {
  const p = join(ROOT, relPath);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(data, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2) + "\n");
  return p;
}
