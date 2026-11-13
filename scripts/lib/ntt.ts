/**
 * Mezo's canonical MUSD bridge (Wormhole NTT): locks MUSD on Mezo and mints it on Base Sepolia,
 * burns it on Base and releases it on Mezo. Reach sends with relaying skipped and delivers the
 * guardian-signed message itself with the permissionless WormholeTransceiver.receiveMessage.
 */
import { erc20Abi, pad, parseAbi, type Address, type Hex, type PublicClient, type TransactionReceipt } from "viem";
import registry from "../../packages/protocol-registry/registry.json" with { type: "json" };
import { obtainVaa, publishedFrom, type Env } from "./env";

export const nttManagerAbi = parseAbi([
  "function transfer(uint256 amount, uint16 recipientChain, bytes32 recipient, bytes32 refundAddress, bool shouldQueue, bytes transceiverInstructions) payable returns (uint64)",
]);
export const transceiverAbi = parseAbi(["function receiveMessage(bytes encodedMessage)"]);

/** One registered Wormhole transceiver; instruction { index 0, 1 byte: shouldSkipRelayerSend = true }. */
export const SKIP_RELAYER: Hex = "0x01000101";

export type NttSide = { name: "mezo" | "base"; wormholeChainId: number; musd: Address; nttManager: Address; transceiver: Address; core: Address; explorer: string };

const ntt = registry.canonicalMusdNtt;
export const nttSides: Record<"mezo" | "base", NttSide> = {
  mezo: { name: "mezo", wormholeChainId: 50, musd: registry.mezo.musd.address as Address, nttManager: ntt.mezoManager as Address, transceiver: ntt.mezoTransceiver as Address, core: registry.mezo.wormholeCore as Address, explorer: "https://explorer.test.mezo.org/tx/" },
  base: { name: "base", wormholeChainId: 10004, musd: ntt.baseMusd as Address, nttManager: ntt.baseManager as Address, transceiver: ntt.baseTransceiver as Address, core: registry.base.wormholeCore as Address, explorer: "https://base-sepolia.blockscout.com/tx/" },
};

/** Sends a contract call and waits for success (the caller supplies its own gas policy). */
export type Sender = (client: PublicClient, req: Record<string, unknown>) => Promise<TransactionReceipt>;

export type NttTransfer = { approve: TransactionReceipt; transfer: TransactionReceipt; deliver: TransactionReceipt; sequence: bigint };

/** Bridges `amount` MUSD from `from` to the other chain for `recipient`, end to end. */
export async function bridgeMusd(env: Env, send: Sender, from: "mezo" | "base", amount: bigint, sender: Address, recipient: Address): Promise<NttTransfer> {
  const src = nttSides[from];
  const dst = nttSides[from === "mezo" ? "base" : "mezo"];
  const srcClient = from === "mezo" ? env.mezo : env.base;
  const dstClient = from === "mezo" ? env.base : env.mezo;
  const approve = await send(srcClient, { address: src.musd, abi: erc20Abi, functionName: "approve", args: [src.nttManager, amount] });
  const transfer = await send(srcClient, {
    address: src.nttManager,
    abi: nttManagerAbi,
    functionName: "transfer",
    args: [amount, dst.wormholeChainId, pad(recipient), pad(sender), false, SKIP_RELAYER],
  });
  const msg = await publishedFrom(srcClient, transfer, src.core);
  const { vaa } = await obtainVaa(env, src.wormholeChainId, msg);
  const deliver = await send(dstClient, { address: dst.transceiver, abi: transceiverAbi, functionName: "receiveMessage", args: [vaa] });
  return { approve, transfer, deliver, sequence: msg.sequence };
}
