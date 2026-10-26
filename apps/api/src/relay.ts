import { readFileSync } from "node:fs";
import { createWalletClient, http, type Hex, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  fetchSignedVaa,
  gasLimitFor,
  parseVaa,
  reachDestinationGatewayAbi,
  reachSourceGatewayAbi,
  type ReachConfig,
} from "@musd-reach/sdk";
import type { Db } from "./db.js";

type Pending = { transfer_id: string; direction: "ISSUE" | "REDEEM"; wormhole_sequence: string; status: string };

/**
 * Tracks guardian signatures for in-flight transfers and, only if RELAYER_KEY_FILE is set,
 * submits them. The relayer has no authority: the target gateway verifies guardian signatures,
 * the enrolled emitter, every bound field and replay state. A relayer can only deliver what
 * guardians already signed, and only once.
 */
export async function trackAndRelay(
  db: Db,
  cfg: ReachConfig,
  clients: { mezo: PublicClient; base: PublicClient },
  relayerKeyFile?: string,
  log: (msg: string, extra?: unknown) => void = () => {},
) {
  const d = cfg.deployment;
  if (!d) return { checked: 0, relayed: 0 };
  const pending = await db.query<Pending>(
    `SELECT transfer_id, direction, wormhole_sequence, status FROM transfers
     WHERE status IN ('SOURCE_LOCKED', 'REMOTE_BURN_FINALIZED', 'VAA_SIGNED')
       AND (vaa_checked_at IS NULL OR vaa_checked_at < now() - interval '20 seconds')
     ORDER BY origin_time NULLS LAST, transfer_id LIMIT 25`,
  );
  const account = relayerKeyFile ? privateKeyToAccount(readFileSync(relayerKeyFile, "utf8").trim() as Hex) : null;
  let relayed = 0;
  for (const t of pending.rows) {
    const issue = t.direction === "ISSUE";
    const res = await fetchSignedVaa({
      api: cfg.wormhole.api,
      emitterChainId: issue ? cfg.mezo.wormholeChainId : cfg.base.wormholeChainId,
      emitter: issue ? d.sourceGateway : d.destinationGateway,
      sequence: BigInt(t.wormhole_sequence),
    });
    if (res.status !== "signed") {
      await db.query("UPDATE transfers SET vaa_checked_at = now() WHERE transfer_id = $1", [t.transfer_id]);
      continue;
    }
    const digest = parseVaa(res.vaa).digest;
    await db.query(
      `UPDATE transfers SET vaa_digest = $2, vaa_checked_at = now(),
         status = CASE WHEN status IN ('SOURCE_LOCKED', 'REMOTE_BURN_FINALIZED') THEN 'VAA_SIGNED' ELSE status END
       WHERE transfer_id = $1`,
      [t.transfer_id, digest],
    );
    if (!account) continue;
    const client = issue ? clients.base : clients.mezo;
    const chain = issue ? cfg.base.chain : cfg.mezo.chain;
    const address = issue ? d.destinationGateway : d.sourceGateway;
    try {
      const sim = issue
        ? await client.simulateContract({ account, address, abi: reachDestinationGatewayAbi, functionName: "receiveIssue", args: [res.vaa] })
        : await client.simulateContract({ account, address, abi: reachSourceGatewayAbi, functionName: "receiveRedeem", args: [res.vaa] });
      // An under-gassed delivery reverts on purpose (InsufficientGasForSettlement) and the transfer
      // would be retried every tick, paying for each failure (F-20).
      const gas = gasLimitFor(chain.id, await client.estimateContractGas(sim.request as never));
      const wallet = createWalletClient({ account, chain, transport: http(issue ? cfg.base.rpcUrls[0] : cfg.mezo.rpcUrls[0]) });
      const hash = await wallet.writeContract({ ...(sim.request as object), gas } as never);
      const receipt = await client.waitForTransactionReceipt({ hash, timeout: 120_000 });
      if (receipt.status !== "success") {
        log("relay reverted", { transferId: t.transfer_id, hash, gas: gas.toString() });
        continue;
      }
      log("relayed", { transferId: t.transfer_id, hash });
      relayed++;
    } catch (e) {
      // Already delivered by someone else, or not yet deliverable. Indexer will observe the outcome.
      log("relay skipped", { transferId: t.transfer_id, reason: (e as Error).message.split("\n")[0] });
    }
  }
  return { checked: pending.rows.length, relayed };
}
