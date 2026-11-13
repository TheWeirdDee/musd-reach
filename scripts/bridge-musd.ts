/**
 * Moves MUSD between Mezo testnet and Base Sepolia through Mezo's own canonical bridge
 * (Wormhole NTT: MUSD is locked on Mezo and minted on Base, burned on Base and released on Mezo).
 *
 *   1. Approve the exact amount to the sending chain's NttManager.
 *   2. NttManager.transfer(...) with relaying skipped, so no relayer fee is paid.
 *   3. Wait for the Wormhole guardians to sign the transceiver message.
 *   4. Deliver it with the permissionless WormholeTransceiver.receiveMessage(vaa) on the other chain.
 *
 *   pnpm --filter @musd-reach/scripts exec tsx bridge-musd.ts --to=base --amount=600 [--recipient=0x…] [--record]
 *   pnpm --filter @musd-reach/scripts exec tsx bridge-musd.ts --to=mezo --amount=50
 *
 * The key comes from REACH_PRIVATE_KEY in the git-ignored project .env.
 */
import { erc20Abi, formatUnits, parseUnits, type Address, type PublicClient, type TransactionReceipt } from "viem";
import { loadAccount, makeEnv, writeEvidence } from "./lib/env";
import { bridgeMusd, nttSides } from "./lib/ntt";

function flag(name: string, fallback?: string) {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  const v = a ? a.split("=")[1] : fallback;
  if (v === undefined) throw new Error(`--${name}= is required`);
  return v;
}

async function main() {
  const env = makeEnv("testnet");
  const to = flag("to");
  if (to !== "base" && to !== "mezo") throw new Error("--to must be base or mezo");
  const from = to === "base" ? "mezo" : "base";
  const [src, dst] = [nttSides[from], nttSides[to]];
  const srcClient = from === "mezo" ? env.mezo : env.base;
  const dstClient = to === "mezo" ? env.mezo : env.base;

  const me = loadAccount("REACH_PRIVATE_KEY_FILE", "REACH_PRIVATE_KEY");
  const amount = parseUnits(flag("amount"), 18);
  const recipient = flag("recipient", me.address) as Address;

  // Same gas policy as the market proof: Mezo enforces a calldata gas floor that viem's estimate can miss.
  const send = async (client: PublicClient, req: Record<string, unknown>): Promise<TransactionReceipt> => {
    const full = { ...req, account: me, chain: client.chain } as never;
    await client.simulateContract(full);
    const est = await client.estimateContractGas(full);
    const gas = client === env.mezo ? (est * 2n > 1_500_000n ? est * 2n : 1_500_000n) : (est * 15n) / 10n + 50_000n;
    const wallet = client === env.mezo ? env.mezoWallet(me) : env.baseWallet(me);
    const hash = await wallet.writeContract({ ...(full as object), gas } as never);
    const receipt = await client.waitForTransactionReceipt({ hash, timeout: 300_000, retryCount: 20 });
    if (receipt.status !== "success") throw new Error(`reverted: ${hash}`);
    return receipt;
  };

  const bal = await srcClient.readContract({ address: src.musd, abi: erc20Abi, functionName: "balanceOf", args: [me.address] });
  if (bal < amount) throw new Error(`need ${formatUnits(amount, 18)} MUSD on ${src.name}, have ${formatUnits(bal, 18)}`);
  const dstBefore = await dstClient.readContract({ address: dst.musd, abi: erc20Abi, functionName: "balanceOf", args: [recipient] });

  console.log(`Bridging ${formatUnits(amount, 18)} MUSD ${src.name} → ${dst.name} through Mezo's NTT; waiting for guardian signatures takes a few minutes…`);
  const t = await bridgeMusd(env, send, from, amount, me.address, recipient);
  console.log(`approve (${src.name}): ${src.explorer}${t.approve.transactionHash}`);
  console.log(`transfer (${src.name}): ${src.explorer}${t.transfer.transactionHash}`);
  console.log(`receiveMessage (${dst.name}): ${dst.explorer}${t.deliver.transactionHash}`);
  const dstAfter = await dstClient.readContract({ address: dst.musd, abi: erc20Abi, functionName: "balanceOf", args: [recipient] });
  console.log(`recipient MUSD on ${dst.name}: ${formatUnits(dstBefore, 18)} → ${formatUnits(dstAfter, 18)}`);

  if (process.argv.includes("--record")) {
    const at = new Date().toISOString().replace(/[:.]/g, "-");
    const file = writeEvidence(`evidence/markets/musd-bridge-${to}-${at}.json`, {
      kind: "PUBLIC_TESTNET_MUSD_BRIDGE",
      direction: `${src.name}->${dst.name}`,
      amount: amount.toString(),
      recipient,
      approveTx: t.approve.transactionHash,
      transferTx: t.transfer.transactionHash,
      wormholeSequence: t.sequence.toString(),
      deliverTx: t.deliver.transactionHash,
      recipientBefore: dstBefore.toString(),
      recipientAfter: dstAfter.toString(),
      recordedAt: new Date().toISOString(),
    });
    console.log(`evidence: ${file}`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
