import {
  decodeAbiParameters,
  encodeAbiParameters,
  keccak256,
  toHex,
  hexToBytes,
  bytesToHex,
  type Address,
  type Hex,
} from "viem";

/** Mirrors `ReachMessages.Message` in packages/contracts/src/shared/ReachMessages.sol. */
export const reachMessageAbi = [
  {
    type: "tuple",
    components: [
      { name: "protocolId", type: "bytes32" },
      { name: "version", type: "uint8" },
      { name: "direction", type: "uint8" },
      { name: "originEvmChainId", type: "uint256" },
      { name: "targetEvmChainId", type: "uint256" },
      { name: "originWormholeChainId", type: "uint16" },
      { name: "targetWormholeChainId", type: "uint16" },
      { name: "originGateway", type: "address" },
      { name: "targetGateway", type: "address" },
      { name: "wrapper", type: "address" },
      { name: "receipt", type: "address" },
      { name: "nonce", type: "uint64" },
      { name: "shares", type: "uint256" },
      { name: "sender", type: "address" },
      { name: "recipient", type: "address" },
      { name: "redeemMode", type: "uint8" },
      { name: "minAssets", type: "uint256" },
      { name: "navAssets", type: "uint256" },
      { name: "navSupply", type: "uint256" },
      { name: "navTimestamp", type: "uint64" },
      { name: "navBlock", type: "uint64" },
    ],
  },
] as const;

export type ReachMessage = {
  protocolId: Hex;
  version: number;
  direction: number;
  originEvmChainId: bigint;
  targetEvmChainId: bigint;
  originWormholeChainId: number;
  targetWormholeChainId: number;
  originGateway: Address;
  targetGateway: Address;
  wrapper: Address;
  receipt: Address;
  nonce: bigint;
  shares: bigint;
  sender: Address;
  recipient: Address;
  redeemMode: number;
  minAssets: bigint;
  navAssets: bigint;
  navSupply: bigint;
  navTimestamp: bigint;
  navBlock: bigint;
};

export const PROTOCOL_ID = keccak256(toHex("MUSD_REACH"));
export const MESSAGE_VERSION = 1;
export const Direction = { ISSUE: 1, REDEEM: 2, NAV: 3 } as const;
export const RedeemMode = { NONE: 0, SHARES: 1, MUSD: 2 } as const;

export function decodeReachMessage(payload: Hex): ReachMessage {
  const [m] = decodeAbiParameters(reachMessageAbi, payload);
  return m as ReachMessage;
}

export function encodeReachMessage(m: ReachMessage): Hex {
  return encodeAbiParameters(reachMessageAbi, [m]);
}

/** Mirrors `ReachMessages.transferId`. */
export function transferIdOf(m: Pick<ReachMessage, "version" | "direction" | "originEvmChainId" | "originWormholeChainId" | "originGateway" | "nonce">): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "uint8" },
        { type: "uint8" },
        { type: "uint256" },
        { type: "uint16" },
        { type: "address" },
        { type: "uint64" },
      ],
      [PROTOCOL_ID, m.version, m.direction, m.originEvmChainId, m.originWormholeChainId, m.originGateway, m.nonce],
    ),
  );
}

export type ParsedVaa = {
  version: number;
  guardianSetIndex: number;
  signatures: { guardianIndex: number; r: Hex; s: Hex; v: number }[];
  timestamp: number;
  nonce: number;
  emitterChainId: number;
  emitterAddress: Hex;
  sequence: bigint;
  consistencyLevel: number;
  payload: Hex;
  body: Hex;
  /** keccak256(keccak256(body)) — the digest guardians sign and Core reports as `vm.hash`. */
  digest: Hex;
};

/** Parses a signed VAA exactly like Wormhole Core's `parseVM`. Does not verify signatures. */
export function parseVaa(vaa: Hex | Uint8Array): ParsedVaa {
  const b = typeof vaa === "string" ? hexToBytes(vaa) : vaa;
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let i = 0;
  const version = b[i]!;
  i += 1;
  if (version !== 1) throw new Error(`unsupported VAA version ${version}`);
  const guardianSetIndex = view.getUint32(i);
  i += 4;
  const n = b[i]!;
  i += 1;
  const signatures = [];
  for (let k = 0; k < n; k++) {
    signatures.push({
      guardianIndex: b[i]!,
      r: bytesToHex(b.slice(i + 1, i + 33)),
      s: bytesToHex(b.slice(i + 33, i + 65)),
      v: b[i + 65]! + 27,
    });
    i += 66;
  }
  const body = b.slice(i);
  const timestamp = view.getUint32(i);
  const nonce = view.getUint32(i + 4);
  const emitterChainId = view.getUint16(i + 8);
  const emitterAddress = bytesToHex(b.slice(i + 10, i + 42));
  const sequence = view.getBigUint64(i + 42);
  const consistencyLevel = b[i + 50]!;
  const payload = bytesToHex(b.slice(i + 51));
  return {
    version,
    guardianSetIndex,
    signatures,
    timestamp,
    nonce,
    emitterChainId,
    emitterAddress,
    sequence,
    consistencyLevel,
    payload,
    body: bytesToHex(body),
    digest: keccak256(keccak256(body)),
  };
}

export const addressToBytes32 = (a: Address): Hex => `0x${a.slice(2).toLowerCase().padStart(64, "0")}`;
export const bytes32ToAddress = (b: Hex): Address => `0x${b.slice(-40)}` as Address;
