"use client";

import { decodeEventLog, pad, parseAbi, parseAbiItem, type Address, type Hex, type TransactionReceipt } from "viem";
import { registry } from "@musd-reach/sdk";
import { reachConfig } from "./reach";

/**
 * Mezo's canonical MUSD bridge (Wormhole NTT). MUSD is locked on Mezo and minted on Base, burned on
 * Base and released on Mezo. The app sends with relaying skipped, then delivers the guardian-signed
 * message itself through the destination WormholeTransceiver's permissionless receiveMessage.
 */
export type BridgeChain = "mezo" | "base";

const ntt = registry.canonicalMusdNtt;
export const bridgeSides = {
  mezo: {
    chain: "mezo" as const,
    label: "Mezo testnet",
    chainId: reachConfig.mezo.evmChainId,
    wormholeChainId: reachConfig.mezo.wormholeChainId,
    musd: reachConfig.mezo.musd as Address,
    manager: ntt.mezoManager as Address,
    transceiver: ntt.mezoTransceiver as Address,
    core: reachConfig.mezo.wormholeCore as Address,
  },
  base: {
    chain: "base" as const,
    label: "Base Sepolia",
    chainId: reachConfig.base.evmChainId,
    wormholeChainId: reachConfig.base.wormholeChainId,
    musd: ntt.baseMusd as Address,
    manager: ntt.baseManager as Address,
    transceiver: ntt.baseTransceiver as Address,
    core: reachConfig.base.wormholeCore as Address,
  },
};

export const nttManagerAbi = parseAbi([
  "function transfer(uint256 amount, uint16 recipientChain, bytes32 recipient, bytes32 refundAddress, bool shouldQueue, bytes transceiverInstructions) payable returns (uint64)",
]);
export const transceiverAbi = parseAbi(["function receiveMessage(bytes encodedMessage)"]);

/** One registered Wormhole transceiver; instruction { index 0, 1 byte: shouldSkipRelayerSend = true }. */
export const SKIP_RELAYER: Hex = "0x01000101";

export const transferArgs = (amount: bigint, to: BridgeChain, recipient: Address) =>
  [amount, bridgeSides[to].wormholeChainId, pad(recipient), pad(recipient), false, SKIP_RELAYER] as const;

const logMessagePublished = parseAbiItem("event LogMessagePublished(address indexed sender, uint64 sequence, uint32 nonce, bytes payload, uint8 consistencyLevel)");

/** The Wormhole sequence the source transceiver published in a bridge transfer. */
export function sequenceFrom(receipt: TransactionReceipt, from: BridgeChain): bigint | null {
  const side = bridgeSides[from];
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== side.core.toLowerCase()) continue;
    try {
      const ev = decodeEventLog({ abi: [logMessagePublished], data: log.data, topics: log.topics });
      if (ev.args.sender.toLowerCase() === side.transceiver.toLowerCase()) return ev.args.sequence;
    } catch {
      continue;
    }
  }
  return null;
}

export type PendingBridge = { from: BridgeChain; amount: string; sequence: string; txHash: Hex; at: number };
const KEY = "reach.mezoBridge.pending";
/** Raw stored value: a stable string snapshot, suitable for useSyncExternalStore. */
export const pendingRaw = (): string | null => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};
export const parsePending = (raw: string | null): PendingBridge | null => {
  try {
    return raw ? (JSON.parse(raw) as PendingBridge) : null;
  } catch {
    return null;
  }
};
export const savePending = (p: PendingBridge | null) => {
  try {
    if (p) localStorage.setItem(KEY, JSON.stringify(p));
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode: the transfer can still be delivered from the explorer */
  }
};
