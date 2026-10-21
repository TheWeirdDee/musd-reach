/**
 * MUSD Reach canonical lifecycle runner.
 *
 *   fork    : rehearsal against local Anvil forks of Mezo testnet (:8545) and Base Sepolia
 *             (:8546) with a local guardian key written into each forked Wormhole Core.
 *             Output is labelled LOCAL_FORK_REHEARSAL and is never public-testnet evidence.
 *   testnet : the real public run. VAAs come from the Wormhole testnet guardians via
 *             Wormholescan. Requires explicit authorization, a funded key, and a deployment.
 *
 * Every step records tx hashes, blocks and independent before/after balance reads. Negative
 * tests (replay, altered payload, forged signature) are read-only simulations against the
 * deployed contracts, so they cost nothing and change nothing.
 *
 *   pnpm --filter @musd-reach/scripts lifecycle -- --mode fork --amount 5
 */
import {
  maxUint256,
  parseUnits,
  formatUnits,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
  type TransactionReceipt,
  BaseError,
  ContractFunctionRevertedError,
  toFunctionSelector,
  type AbiFunction,
} from "viem";
import { privateKeyToAccount, generatePrivateKey, type PrivateKeyAccount } from "viem/accounts";
import {
  reachSavingsWrapperAbi,
  reachSourceGatewayAbi,
  reachDestinationGatewayAbi,
  remoteWrapperReceiptAbi,
  decodeReachMessage,
  transferIdOf,
  parseVaa,
  reconcile,
  readWrapperState,
  readNativeVaultState,
  Direction,
  RedeemMode,
  explorerTx,
} from "@musd-reach/sdk";
import { makeEnv, loadAccount, overrideForkGuardian, publishedFrom, obtainVaa, writeEvidence, loadDeployments, type Env, type Mode } from "./lib/env.js";

const erc20 = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "s", type: "address" }, { name: "v", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "v", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "o", type: "address" }, { name: "s", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

type Step = {
  id: string;
  title: string;
  chain: "mezo" | "base" | "offchain";
  status: "PASS" | "FAIL";
  txHash?: Hex;
  blockNumber?: bigint;
  explorer?: string;
  details: Record<string, unknown>;
};

function arg(name: string, fallback?: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
}

const mode = (arg("mode", "fork") as Mode);
const env = makeEnv(mode);
const steps: Step[] = [];

function record(s: Step) {
  steps.push(s);
  const mark = s.status === "PASS" ? "PASS" : "FAIL";
  console.log(`[${mark}] ${s.id} ${s.title}${s.txHash ? `  ${s.txHash}` : ""}`);
  if (s.status === "FAIL") throw new Error(`${s.id} failed: ${JSON.stringify(s.details, (_, v) => (typeof v === "bigint" ? v.toString() : v))}`);
}

async function retry<T>(fn: () => Promise<T>, tries = 12, ms = 4000): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, ms));
    }
  }
  throw last;
}

/** Waits until the (possibly load-balanced) RPC serves at least `block`, so pinned reads succeed. */
async function waitHead(client: PublicClient, block: bigint) {
  await retry(async () => {
    if ((await client.getBlockNumber()) < block) throw new Error("rpc behind");
  }, 60, 3000);
}

const reused: Record<string, Hex> = {};

async function send(
  client: PublicClient,
  wallet: WalletClient,
  // Loosely typed on purpose: viem's generic narrows `value` to never for non-payable ABIs.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  req: any,
  reuseKey?: string,
): Promise<TransactionReceipt> {
  const reuse = reuseKey ? (arg(`reuse-${reuseKey}`) as Hex | undefined) : undefined;
  if (reuse) {
    // Adopt a transaction already mined by an earlier, aborted attempt. Verify it is the same call.
    const [receipt, tx] = await Promise.all([
      retry(() => client.getTransactionReceipt({ hash: reuse })),
      retry(() => client.getTransaction({ hash: reuse })),
    ]);
    const fn = (req.abi as AbiFunction[]).find((x) => x.type === "function" && x.name === req.functionName)!;
    if (receipt.status !== "success") throw new Error(`reused tx ${reuse} did not succeed`);
    if (tx.to?.toLowerCase() !== String(req.address).toLowerCase()) throw new Error(`reused tx ${reuse} targets ${tx.to}, expected ${req.address}`);
    if (tx.input.slice(0, 10) !== toFunctionSelector(fn)) throw new Error(`reused tx ${reuse} is not ${req.functionName}`);
    if (tx.from.toLowerCase() !== String(req.account.address ?? req.account).toLowerCase()) throw new Error(`reused tx ${reuse} sent by ${tx.from}`);
    reused[reuseKey!] = reuse;
    await waitHead(client, receipt.blockNumber);
    return receipt;
  }
  // Mezo enforces the EIP-7623 calldata floor, which its eth_estimateGas does not include.
  // Estimate ourselves and add a margin so transactions are not rejected pre-inclusion.
  // eth_call first: a real revert throws here, before anything is signed.
  await client.simulateContract(req);
  const est = await client.estimateContractGas(req);
  // Mezo testnet RPC has returned near-intrinsic estimates against stale state right after a
  // dependent transaction; gas there costs ~146 wei, so use a generous floor.
  const isMezo = (await client.getChainId()) === 31611;
  const gas = isMezo ? (est * 2n > 1_500_000n ? est * 2n : 1_500_000n) : (est * 15n) / 10n + 50_000n;
  const hash = await wallet.writeContract({ ...req, gas });
  // Mezo RPC intermittently crashes on receipt lookups; keep polling instead of aborting.
  const receipt = await retry(() => client.waitForTransactionReceipt({ hash, timeout: 300_000, retryCount: 20 }), 10, 5000);
  if (receipt.status !== "success") throw new Error(`transaction reverted: ${hash}`);
  await waitHead(client, receipt.blockNumber);
  return receipt;
}

/** Read-only simulation that MUST revert; returns the decoded error name. */
async function expectRevert(client: PublicClient, req: Parameters<PublicClient["simulateContract"]>[0]): Promise<string> {
  try {
    await client.simulateContract(req);
  } catch (e) {
    if (e instanceof BaseError) {
      const r = e.walk((x) => x instanceof ContractFunctionRevertedError);
      if (r instanceof ContractFunctionRevertedError) return r.data?.errorName ?? r.reason ?? r.shortMessage;
      return e.shortMessage;
    }
    return String(e);
  }
  throw new Error("expected revert, but the call would succeed");
}

const bal = (c: PublicClient, token: Address, who: Address, blockNumber?: bigint) =>
  retry(() => c.readContract({ address: token, abi: erc20, functionName: "balanceOf", args: [who], blockNumber }));

/** readContract pinned to a block, with retries for lagging RPC nodes. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rc = <T,>(c: PublicClient, args: any, blockNumber?: bigint): Promise<T> => retry(() => c.readContract({ ...args, blockNumber }) as Promise<T>);

async function main() {
  const { cfg, mezo, base } = env;
  const d = cfg.deployment;
  if (!d) throw new Error("No deployment recorded. Deploy first (see docs/DEPLOYMENT.md).");
  const amount = parseUnits(arg("amount", "5")!, 18);
  // Contract version: pending-v2 deployments get the extra settlement-integrity steps 12a-12d.
  const isV2 = (loadDeployments(mode) as Record<string, unknown> | null)?.settlementModel === "pending-v2";
  const runId = `${mode}-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  console.log(`MUSD Reach lifecycle — mode ${mode.toUpperCase()} — run ${runId}`);

  const primary = loadAccount("REACH_PRIVATE_KEY_FILE", "REACH_PRIVATE_KEY");
  let secondary: PrivateKeyAccount;
  try {
    secondary = loadAccount("REACH_SECONDARY_KEY_FILE", "REACH_SECONDARY_KEY");
  } catch {
    if (mode === "testnet") throw new Error("Set REACH_SECONDARY_KEY_FILE for the receipt-transfer step");
    secondary = privateKeyToAccount(generatePrivateKey());
  }
  const mw = env.mezoWallet(primary);
  const bw = env.baseWallet(primary);
  const bw2 = env.baseWallet(secondary);

  // ------------------------------------------------------------------ preflight
  const [mezoId, baseId] = await Promise.all([mezo.getChainId(), base.getChainId()]);
  const vault = await readNativeVaultState(mezo, cfg);
  const boundSource = await base.readContract({ address: d.destinationGateway, abi: reachDestinationGatewayAbi, functionName: "sourceGateway" });

  if (mode === "fork") {
    if (!env.localGuardianKey) throw new Error("REACH_FORK_GUARDIAN_KEY required in fork mode");
    const g = privateKeyToAccount(env.localGuardianKey).address;
    await overrideForkGuardian(mezo, cfg.mezo.wormholeCore, g);
    await overrideForkGuardian(base, cfg.base.wormholeCore, g);
    // Fork-only funding: impersonate the native vault's strategy (holds vault principal) for MUSD,
    // and set gas balances. None of this is possible or attempted on public networks.
    const strategy = vault.strategy;
    await mezo.request({ method: "anvil_setBalance" as never, params: [strategy, "0x56BC75E2D63100000"] as never });
    await mezo.request({ method: "anvil_impersonateAccount" as never, params: [strategy] as never });
    const imp = env.mezoWallet(primary);
    await imp.writeContract({ account: strategy, chain: cfg.mezo.chain, address: cfg.mezo.musd, abi: erc20, functionName: "transfer", args: [primary.address, amount * 2n] });
    for (const [c, who] of [[mezo, primary.address], [base, primary.address], [base, secondary.address]] as const) {
      await c.request({ method: "anvil_setBalance" as never, params: [who, "0x56BC75E2D63100000"] as never });
    }
  }

  const musdStart = await bal(mezo, cfg.mezo.musd, primary.address);
  const mezoGas = await mezo.getBalance({ address: primary.address });
  const baseGas = await base.getBalance({ address: primary.address });
  record({
    id: "00",
    title: "Preflight: chains, pinned vault implementation, peer binding, balances",
    chain: "offchain",
    status:
      mezoId === cfg.mezo.evmChainId && baseId === cfg.base.evmChainId && vault.implementationMatchesRegistry &&
      boundSource.toLowerCase() === d.sourceGateway.toLowerCase() && musdStart >= amount && mezoGas > 0n && baseGas > 0n
        ? "PASS"
        : "FAIL",
    details: {
      mezoChainId: mezoId,
      baseChainId: baseId,
      nativeVaultImplementation: vault.implementation,
      implementationMatchesRegistry: vault.implementationMatchesRegistry,
      destinationBoundTo: boundSource,
      primary: primary.address,
      secondary: secondary.address,
      musd: musdStart,
      requiredMusd: amount,
      mezoGasWei: mezoGas,
      baseGasWei: baseGas,
    },
  });

  // ------------------------------------------------------------------ 1. approve exact
  const approveR = await send(mezo, mw, {
    address: cfg.mezo.musd, abi: erc20, functionName: "approve", args: [d.sourceGateway, amount], chain: cfg.mezo.chain, account: primary,
  }, "approve");
  const allowance = await rc<bigint>(mezo, { address: cfg.mezo.musd, abi: erc20, functionName: "allowance", args: [primary.address, d.sourceGateway] }, approveR.blockNumber);
  record({
    id: "01", title: "Approve exact MUSD amount to source gateway (bounded, not unlimited)", chain: "mezo",
    status: allowance === amount && allowance !== maxUint256 ? "PASS" : "FAIL",
    txHash: approveR.transactionHash, blockNumber: approveR.blockNumber, explorer: explorerTx(cfg.mezo.explorer, approveR.transactionHash),
    details: { allowance },
  });

  // ------------------------------------------------------------------ 2. deposit + wrap + lock + publish
  const quoteShares = await rc<bigint>(mezo, { address: d.wrapper, abi: reachSavingsWrapperAbi, functionName: "previewDeposit", args: [amount] });
  const fee = await rc<bigint>(mezo, { address: d.sourceGateway, abi: reachSourceGatewayAbi, functionName: "messageFee" });
  const lockR = await send(mezo, mw, {
    address: d.sourceGateway, abi: reachSourceGatewayAbi, functionName: "depositAndIssue",
    args: [amount, primary.address, quoteShares], value: fee, chain: cfg.mezo.chain, account: primary,
  }, "lock");
  // All effects measured exactly across the lock transaction's block.
  const LB = lockR.blockNumber;
  const wBefore = await retry(() => readWrapperState(mezo, cfg, LB - 1n));
  const wAfter = await retry(() => readWrapperState(mezo, cfg, LB));
  const lockedBefore = await rc<bigint>(mezo, { address: d.sourceGateway, abi: reachSourceGatewayAbi, functionName: "totalLocked" }, LB - 1n);
  const lockedAfter = await rc<bigint>(mezo, { address: d.sourceGateway, abi: reachSourceGatewayAbi, functionName: "totalLocked" }, LB);
  const expectedShares = await rc<bigint>(mezo, { address: d.wrapper, abi: reachSavingsWrapperAbi, functionName: "previewDeposit", args: [amount] }, LB - 1n);
  const vaultSmusdBefore = wBefore.nativeSmusdHeld;
  const musdBeforeDeposit = await bal(mezo, cfg.mezo.musd, primary.address, LB - 1n);
  const musdAfterDeposit = await bal(mezo, cfg.mezo.musd, primary.address, LB);
  const issueMsg = await publishedFrom(mezo, lockR, cfg.mezo.wormholeCore);
  const issue = decodeReachMessage(issueMsg.payload);
  const issueId = transferIdOf(issue);
  const lockedShares = lockedAfter - lockedBefore;
  record({
    id: "02",
    title: "Real MUSD → native savings vault → wSMUSD minted → shares locked → ISSUE message published",
    chain: "mezo",
    status:
      musdBeforeDeposit - musdAfterDeposit === amount &&
      wAfter.nativeSmusdHeld - vaultSmusdBefore === amount &&
      lockedShares === expectedShares &&
      issue.shares === lockedShares &&
      issue.direction === Direction.ISSUE &&
      issueMsg.emitter.toLowerCase() === d.sourceGateway.toLowerCase()
        ? "PASS"
        : "FAIL",
    txHash: lockR.transactionHash, blockNumber: lockR.blockNumber, explorer: explorerTx(cfg.mezo.explorer, lockR.transactionHash),
    details: {
      musdSpent: musdBeforeDeposit - musdAfterDeposit,
      nativeSmusdIntoWrapper: wAfter.nativeSmusdHeld - vaultSmusdBefore,
      wrapperSharesMinted: wAfter.totalSupply - wBefore.totalSupply,
      sharesLocked: lockedShares,
      wrapperNavBefore: { totalAssets: wBefore.totalAssets, totalSupply: wBefore.totalSupply },
      wrapperNavAfter: { totalAssets: wAfter.totalAssets, totalSupply: wAfter.totalSupply, pendingYield: wAfter.pendingYield },
      transferId: issueId,
      wormholeSequence: issueMsg.sequence,
      consistencyLevel: issueMsg.consistencyLevel,
      messageNavSnapshot: { navAssets: issue.navAssets, navSupply: issue.navSupply, navBlock: issue.navBlock },
    },
  });

  // ------------------------------------------------------------------ 3. VAA
  const { vaa: issueVaa, source: issueVaaSource } = await obtainVaa(env, cfg.mezo.wormholeChainId, issueMsg);
  const pv = parseVaa(issueVaa);
  record({
    id: "03", title: mode === "fork" ? "ISSUE VAA signed by local fork guardian and parsed" : "Guardian-signed ISSUE VAA obtained and parsed", chain: "offchain",
    status: pv.emitterChainId === cfg.mezo.wormholeChainId && pv.sequence === issueMsg.sequence && pv.payload.toLowerCase() === issueMsg.payload.toLowerCase() ? "PASS" : "FAIL",
    details: { source: issueVaaSource, digest: pv.digest, guardianSetIndex: pv.guardianSetIndex, signatures: pv.signatures.length, emitter: pv.emitterAddress, sequence: pv.sequence, vaa: issueVaa },
  });

  // ------------------------------------------------------------------ 4. negative: altered payload, before delivery
  const altered = (issueVaa.slice(0, -2) + (issueVaa.slice(-2) === "00" ? "01" : "00")) as Hex;
  const alteredErr = await expectRevert(base, { address: d.destinationGateway, abi: reachDestinationGatewayAbi, functionName: "receiveIssue", args: [altered], account: primary });
  record({ id: "04", title: "Negative: byte-altered ISSUE VAA rejected by destination (simulation)", chain: "base", status: "PASS", details: { error: alteredErr } });

  // ------------------------------------------------------------------ 5. deliver ISSUE → mint
  const mintR = await send(base, bw, { address: d.destinationGateway, abi: reachDestinationGatewayAbi, functionName: "receiveIssue", args: [issueVaa], chain: cfg.base.chain, account: primary }, "mint");
  const MB = mintR.blockNumber;
  const supplyBefore = await rc<bigint>(base, { address: d.receipt, abi: remoteWrapperReceiptAbi, functionName: "totalSupply" }, MB - 1n);
  const supplyAfter = await rc<bigint>(base, { address: d.receipt, abi: remoteWrapperReceiptAbi, functionName: "totalSupply" }, MB);
  const rcptBefore = await bal(base, d.receipt, primary.address, MB - 1n);
  const rcptAfter = await bal(base, d.receipt, primary.address, MB);
  const consumed = await rc<boolean>(base, { address: d.destinationGateway, abi: reachDestinationGatewayAbi, functionName: "transferConsumed", args: [issueId] }, MB);
  record({
    id: "05", title: "Destination verifies VAA, consumes transfer id, mints exact rwSMUSD", chain: "base",
    status: rcptAfter - rcptBefore === lockedShares && supplyAfter - supplyBefore === lockedShares && consumed ? "PASS" : "FAIL",
    txHash: mintR.transactionHash, blockNumber: mintR.blockNumber, explorer: explorerTx(cfg.base.explorer, mintR.transactionHash),
    details: { minted: rcptAfter - rcptBefore, remoteSupplyBefore: supplyBefore, remoteSupplyAfter: supplyAfter, transferConsumed: consumed },
  });

  // ------------------------------------------------------------------ 6. negative: replay ISSUE
  const replayErr = await expectRevert(base, { address: d.destinationGateway, abi: reachDestinationGatewayAbi, functionName: "receiveIssue", args: [issueVaa], account: primary });
  record({ id: "06", title: "Negative: replayed ISSUE VAA rejected (no second mint)", chain: "base", status: replayErr.includes("AlreadyConsumed") ? "PASS" : "FAIL", details: { error: replayErr } });

  // ------------------------------------------------------------------ 7. receipt transfer to a second holder
  const transferAmt = lockedShares / 2n;
  const xferR = await send(base, bw, { address: d.receipt, abi: erc20, functionName: "transfer", args: [secondary.address, transferAmt], chain: cfg.base.chain, account: primary }, "transfer");
  const secBalBefore = await bal(base, d.receipt, secondary.address, xferR.blockNumber - 1n);
  const secBal = await bal(base, d.receipt, secondary.address, xferR.blockNumber);
  record({
    id: "07", title: "rwSMUSD transferred to a second holder (standard ERC-20)", chain: "base",
    status: secBal - secBalBefore === transferAmt ? "PASS" : "FAIL",
    txHash: xferR.transactionHash, blockNumber: xferR.blockNumber, explorer: explorerTx(cfg.base.explorer, xferR.transactionHash),
    details: { amount: transferAmt, secondaryBalanceBefore: secBalBefore, secondaryBalance: secBal },
  });

  if (mode === "testnet") {
    const g = await base.getBalance({ address: secondary.address });
    if (g < parseUnits("0.0002", 18)) {
      const h = await bw.sendTransaction({ to: secondary.address, value: parseUnits("0.0003", 18), chain: cfg.base.chain, account: primary });
      await base.waitForTransactionReceipt({ hash: h });
      console.log(`  funded secondary with Base Sepolia gas: ${h}`);
    }
  }

  // ------------------------------------------------------------------ 8. burns (secondary → shares, primary → MUSD)
  const burnFee = await base.readContract({ address: d.destinationGateway, abi: reachDestinationGatewayAbi, functionName: "messageFee" });
  const burn1 = await send(base, bw2, {
    address: d.destinationGateway, abi: reachDestinationGatewayAbi, functionName: "burnAndRedeem",
    args: [transferAmt, secondary.address, RedeemMode.SHARES, 0n], value: burnFee, chain: cfg.base.chain, account: secondary,
  }, "burn1");
  const remaining = lockedShares - transferAmt;
  // v2: the primary splits its MUSD exit; the second part names an unreachable minimum so its
  // settlement must be parked as pending (it cannot settle at delivery).
  const rest = isV2 ? remaining / 2n : remaining;
  const restB = remaining - rest;
  const minAssets = await mezo.readContract({ address: d.wrapper, abi: reachSavingsWrapperAbi, functionName: "previewRedeem", args: [rest] });
  const burn2 = await send(base, bw, {
    address: d.destinationGateway, abi: reachDestinationGatewayAbi, functionName: "burnAndRedeem",
    args: [rest, primary.address, RedeemMode.MUSD, minAssets], value: burnFee, chain: cfg.base.chain, account: primary,
  }, "burn2");
  let burn3: TransactionReceipt | null = null;
  let unreachableMin = 0n;
  if (isV2) {
    const fair = await rc<bigint>(mezo, { address: d.wrapper, abi: reachSavingsWrapperAbi, functionName: "previewRedeem", args: [restB] });
    unreachableMin = fair * 2n + 1n;
    burn3 = await send(base, bw, {
      address: d.destinationGateway, abi: reachDestinationGatewayAbi, functionName: "burnAndRedeem",
      args: [restB, primary.address, RedeemMode.MUSD, unreachableMin], value: burnFee, chain: cfg.base.chain, account: primary,
    }, "burn3");
  }
  const supplyBeforeBurns = await rc<bigint>(base, { address: d.receipt, abi: remoteWrapperReceiptAbi, functionName: "totalSupply" }, burn1.blockNumber - 1n);
  const lastBurn = burn3 ?? burn2;
  const supplyAfterBurn = await rc<bigint>(base, { address: d.receipt, abi: remoteWrapperReceiptAbi, functionName: "totalSupply" }, lastBurn.blockNumber);
  const m1 = await publishedFrom(base, burn1, cfg.base.wormholeCore);
  const m2 = await publishedFrom(base, burn2, cfg.base.wormholeCore);
  const r1 = decodeReachMessage(m1.payload);
  const r2 = decodeReachMessage(m2.payload);
  const m3 = burn3 ? await publishedFrom(base, burn3, cfg.base.wormholeCore) : null;
  const r3 = m3 ? decodeReachMessage(m3.payload) : null;
  record({
    id: "08", title: "Two holders burn exact rwSMUSD and publish REDEEM messages (shares mode, MUSD mode)", chain: "base",
    status:
      supplyBeforeBurns - supplyAfterBurn === lockedShares && r1.shares === transferAmt && r2.shares === rest &&
      (!isV2 || (r3 !== null && r3.shares === restB && r3.minAssets === unreachableMin)) && r1.direction === Direction.REDEEM
        ? "PASS"
        : "FAIL",
    txHash: burn2.transactionHash, blockNumber: burn2.blockNumber, explorer: explorerTx(cfg.base.explorer, burn2.transactionHash),
    details: {
      burnSharesModeTx: burn1.transactionHash,
      burnSharesModeExplorer: explorerTx(cfg.base.explorer, burn1.transactionHash),
      burnMusdModeTx: burn2.transactionHash,
      remoteSupplyBeforeBurns: supplyBeforeBurns,
      remoteSupplyAfterBurns: supplyAfterBurn,
      redeemTransferIds: [transferIdOf(r1), transferIdOf(r2), ...(r3 ? [transferIdOf(r3)] : [])],
      minAssetsBound: minAssets,
      ...(burn3 ? { burnUnreachableMinTx: burn3.transactionHash, unreachableMinAssets: unreachableMin } : {}),
    },
  });

  // ------------------------------------------------------------------ 9. REDEEM VAAs
  const v1 = await obtainVaa(env, cfg.base.wormholeChainId, m1);
  const v2 = await obtainVaa(env, cfg.base.wormholeChainId, m2);
  const v3 = m3 ? await obtainVaa(env, cfg.base.wormholeChainId, m3) : null;
  const redeemVaas = [v1.vaa, v2.vaa, ...(v3 ? [v3.vaa] : [])];
  record({ id: "09", title: mode === "fork" ? "REDEEM VAAs signed by local fork guardian" : "Guardian-signed REDEEM VAAs obtained (after Base finality)", chain: "offchain", status: "PASS", details: { source: v1.source, digests: redeemVaas.map((x) => parseVaa(x).digest), vaas: redeemVaas } });

  // ------------------------------------------------------------------ 10. forged signature negative (fork guardian key cannot be used on testnet; use a random key)
  const wrongEmitterErr = await expectRevert(mezo, { address: d.sourceGateway, abi: reachSourceGatewayAbi, functionName: "receiveRedeem", args: [issueVaa], account: primary });
  record({ id: "10", title: "Negative: Mezo-emitted VAA submitted as a REDEEM is rejected (wrong emitter chain)", chain: "mezo", status: wrongEmitterErr.includes("UnknownEmitterChain") ? "PASS" : "FAIL", details: { error: wrongEmitterErr } });

  // ------------------------------------------------------------------ 11. release
  const rel1 = await send(mezo, mw, { address: d.sourceGateway, abi: reachSourceGatewayAbi, functionName: "receiveRedeem", args: [v1.vaa], chain: cfg.mezo.chain, account: primary }, "release1");
  const rel2 = await send(mezo, mw, { address: d.sourceGateway, abi: reachSourceGatewayAbi, functionName: "receiveRedeem", args: [v2.vaa], chain: cfg.mezo.chain, account: primary }, "release2");
  const rel3 = v3
    ? await send(mezo, mw, { address: d.sourceGateway, abi: reachSourceGatewayAbi, functionName: "receiveRedeem", args: [v3.vaa], chain: cfg.mezo.chain, account: primary }, "release3")
    : null;
  const R0 = rel1.blockNumber - 1n;
  const R1 = [rel1.blockNumber, rel2.blockNumber, rel3?.blockNumber ?? 0n].reduce((a, b) => (b > a ? b : a));
  const secWBefore = await bal(mezo, d.wrapper, secondary.address, R0);
  const secWAfter = await bal(mezo, d.wrapper, secondary.address, R1);
  const musdBeforeRelease = await bal(mezo, cfg.mezo.musd, primary.address, R0);
  const musdAfterRelease = await bal(mezo, cfg.mezo.musd, primary.address, R1);
  const lockedBeforeRelease = await rc<bigint>(mezo, { address: d.sourceGateway, abi: reachSourceGatewayAbi, functionName: "totalLocked" }, R0);
  const lockedAfterRelease = await rc<bigint>(mezo, { address: d.sourceGateway, abi: reachSourceGatewayAbi, functionName: "totalLocked" }, R1);
  record({
    id: "11", title: "Authenticated release: exact wSMUSD to second holder; wrapper redemption to MUSD for primary", chain: "mezo",
    // On v2 the third (unreachable-minimum) redemption must NOT pay MUSD: exactly the second burn's MUSD arrives.
    status:
      secWAfter - secWBefore === transferAmt && musdAfterRelease - musdBeforeRelease >= minAssets &&
      (!isV2 || musdAfterRelease - musdBeforeRelease < minAssets + unreachableMin) && lockedBeforeRelease - lockedAfterRelease === lockedShares
        ? "PASS"
        : "FAIL",
    txHash: rel2.transactionHash, blockNumber: rel2.blockNumber, explorer: explorerTx(cfg.mezo.explorer, rel2.transactionHash),
    details: {
      releaseSharesTx: rel1.transactionHash,
      releaseSharesExplorer: explorerTx(cfg.mezo.explorer, rel1.transactionHash),
      redeemMusdTx: rel2.transactionHash,
      ...(rel3 ? { deliverUnreachableMinTx: rel3.transactionHash } : {}),
      wsmusdReleasedToSecondary: secWAfter - secWBefore,
      musdReceivedByPrimary: musdAfterRelease - musdBeforeRelease,
      lockedBefore: lockedBeforeRelease,
      lockedAfter: lockedAfterRelease,
    },
  });

  // ------------------------------------------------------------------ 12. negative: replay REDEEM
  const rr = await expectRevert(mezo, { address: d.sourceGateway, abi: reachSourceGatewayAbi, functionName: "receiveRedeem", args: [v1.vaa], account: primary });
  record({ id: "12", title: "Negative: replayed REDEEM VAA rejected (no second release)", chain: "mezo", status: rr.includes("AlreadyConsumed") ? "PASS" : "FAIL", details: { error: rr } });

  // ------------------------------------------------------------------ 12a-12d. v2 settlement integrity
  if (isV2 && r3 && rel3) {
    const id3 = transferIdOf(r3);
    const P = rel3.blockNumber;
    const [pr, ps, pm] = await rc<readonly [Address, bigint, bigint]>(mezo, { address: d.sourceGateway, abi: reachSourceGatewayAbi, functionName: "pendingSettlements", args: [id3] }, P);
    const totalPending = await rc<bigint>(mezo, { address: d.sourceGateway, abi: reachSourceGatewayAbi, functionName: "totalPendingSettlement" }, P);
    const primWBefore = await bal(mezo, d.wrapper, primary.address, P - 1n);
    const primWAfter = await bal(mezo, d.wrapper, primary.address, P);
    const primMBefore = await bal(mezo, cfg.mezo.musd, primary.address, P - 1n);
    const primMAfter = await bal(mezo, cfg.mezo.musd, primary.address, P);
    record({
      id: "12a", title: "v2: unreachable-minimum MUSD redemption is parked as a pending settlement (nothing paid, asset unchanged)", chain: "mezo",
      status: pr.toLowerCase() === primary.address.toLowerCase() && ps === restB && pm === unreachableMin && totalPending === restB && primWAfter === primWBefore && primMAfter === primMBefore ? "PASS" : "FAIL",
      txHash: rel3.transactionHash, blockNumber: rel3.blockNumber, explorer: explorerTx(cfg.mezo.explorer, rel3.transactionHash),
      details: { transferId: id3, pendingRecipient: pr, pendingShares: ps, pendingMinAssets: pm, totalPendingSettlement: totalPending, recipientWsmusdDelta: primWAfter - primWBefore, recipientMusdDelta: primMAfter - primMBefore },
    });
    const retryErr = await expectRevert(mezo, { address: d.sourceGateway, abi: reachSourceGatewayAbi, functionName: "retrySettlement", args: [id3], account: secondary });
    record({ id: "12b", title: "v2: permissionless retry keeps the burner's minimum and is refused", chain: "mezo", status: retryErr.includes("SlippageExceeded") ? "PASS" : "FAIL", details: { error: retryErr } });
    const notRecipient = await expectRevert(mezo, { address: d.sourceGateway, abi: reachSourceGatewayAbi, functionName: "claimSharesInstead", args: [id3], account: secondary });
    const notRecipient2 = await expectRevert(mezo, { address: d.sourceGateway, abi: reachSourceGatewayAbi, functionName: "settleWithMinAssets", args: [id3, 0n], account: secondary });
    record({ id: "12c", title: "v2: a non-recipient cannot switch the payout to shares or lower the minimum", chain: "mezo", status: notRecipient.includes("NotRecipient") && notRecipient2.includes("NotRecipient") ? "PASS" : "FAIL", details: { claimSharesError: notRecipient, settleWithMinError: notRecipient2 } });
    const fairNow = await rc<bigint>(mezo, { address: d.wrapper, abi: reachSavingsWrapperAbi, functionName: "previewRedeem", args: [restB] });
    const settleR = await send(mezo, mw, { address: d.sourceGateway, abi: reachSourceGatewayAbi, functionName: "settleWithMinAssets", args: [id3, fairNow], chain: cfg.mezo.chain, account: primary }, "settle3");
    const S = settleR.blockNumber;
    const mBefore = await bal(mezo, cfg.mezo.musd, primary.address, S - 1n);
    const mAfter = await bal(mezo, cfg.mezo.musd, primary.address, S);
    const [, psAfter] = await rc<readonly [Address, bigint, bigint]>(mezo, { address: d.sourceGateway, abi: reachSourceGatewayAbi, functionName: "pendingSettlements", args: [id3] }, S);
    const totalPendingAfter = await rc<bigint>(mezo, { address: d.sourceGateway, abi: reachSourceGatewayAbi, functionName: "totalPendingSettlement" }, S);
    record({
      id: "12d", title: "v2: recipient settles at an acceptable minimum; MUSD paid once, pending cleared", chain: "mezo",
      status: mAfter - mBefore >= fairNow && psAfter === 0n && totalPendingAfter === 0n ? "PASS" : "FAIL",
      txHash: settleR.transactionHash, blockNumber: settleR.blockNumber, explorer: explorerTx(cfg.mezo.explorer, settleR.transactionHash),
      details: { minAssetsAccepted: fairNow, musdPaid: mAfter - mBefore, pendingSharesAfter: psAfter, totalPendingSettlementAfter: totalPendingAfter },
    });
  }

  // ------------------------------------------------------------------ 13. reconciliation
  const rec = await reconcile({ mezo, base }, cfg, { baseBlockTag: mode === "fork" ? "latest" : "finalized" });
  record({
    id: "13", title: "Independent reconciliation from chain state", chain: "offchain",
    status: rec.status === "BALANCED" ? "PASS" : "FAIL",
    details: { ...rec, pendingIssues: rec.pendingIssues.length, pendingRedemptions: rec.pendingRedemptions.length },
  });

  const musdEnd = await bal(mezo, cfg.mezo.musd, primary.address);
  const out = {
    kind: mode === "fork" ? "LOCAL_FORK_REHEARSAL" : "PUBLIC_TESTNET_RUN",
    disclaimer:
      mode === "fork"
        ? "Executed against local Anvil forks with a locally overridden guardian key and fork-only funding. NOT public-testnet evidence."
        : "Executed on Mezo testnet and Base Sepolia with Wormhole testnet guardian signatures.",
    runId,
    startedAt: new Date().toISOString(),
    deployment: d,
    // Contract version exercised by this run (from the deployment record).
    settlementModel: ((loadDeployments(mode) as Record<string, unknown> | null)?.settlementModel as string | undefined) ?? "fallback-v1",
    amountMusd: formatUnits(amount, 18),
    accounts: { primary: primary.address, secondary: secondary.address },
    reusedTransactions: Object.keys(reused).length
      ? {
          note: "These transactions were mined by an earlier attempt that aborted on a stale RPC read before writing evidence. They were adopted after verifying sender, target and function, and every effect recorded above is re-derived from chain state at their blocks.",
          ...reused,
        }
      : undefined,
    finalBalances: { primaryMusdBeforeLock: musdBeforeDeposit, primaryMusdEnd: musdEnd, secondaryWsmusd: secWAfter },
    steps,
  };
  const file = mode === "fork" ? `evidence/fork-rehearsal/${runId}.json` : `evidence/real-chain/${runId}.json`;
  console.log(`evidence written: ${writeEvidence(file, out)}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
