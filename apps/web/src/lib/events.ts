import { decodeEventLog, type AbiEvent, type Address, type TransactionReceipt } from "viem";
import { reachEvents } from "@musd-reach/sdk";

function find<E extends AbiEvent>(receipt: TransactionReceipt, address: Address, event: E) {
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== address.toLowerCase()) continue;
    try {
      return decodeEventLog({ abi: [event], data: log.data, topics: log.topics }).args as Record<string, unknown>;
    } catch {
      /* different event */
    }
  }
  return null;
}

export const parseLock = (r: TransactionReceipt, gateway: Address) =>
  find(r, gateway, reachEvents.sharesLocked) as { transferId: `0x${string}`; sender: Address; recipient: Address; shares: bigint; sequence: bigint; nonce: bigint } | null;

export const parseBurn = (r: TransactionReceipt, gateway: Address) =>
  find(r, gateway, reachEvents.receiptBurned) as { transferId: `0x${string}`; holder: Address; recipient: Address; shares: bigint; mode: number; sequence: bigint; nonce: bigint } | null;
