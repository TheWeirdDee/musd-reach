#!/usr/bin/env tsx
/**
 * reach-verify — independent read-only verification of MUSD Reach.
 *
 *   reach-verify registry                 pinned protocol facts vs live chain state
 *   reach-verify deployment               Reach contract wiring vs deployments/testnet.json
 *   reach-verify reconcile                backing equation from chain state only
 *   reach-verify evidence <file.json>     re-check every tx receipt and re-verify every VAA
 *   reach-verify bytecode                 deployed runtime code == compiled artifacts (immutables masked)
 *   reach-verify all [evidence.json]      everything above
 *
 * Options: --deployments <path>  --mezo-rpc <url>[,<url>]  --base-rpc <url>[,<url>]  --json
 *          --base-block-tag finalized   (stricter Base snapshot; can false-alarm, see F-13)
 * Exit code is non-zero if any check fails. No transaction is ever sent.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Hex, type PublicClient } from "viem";
import {
  buildConfig,
  createReachClients,
  readNativeVaultState,
  reconcile,
  parseVaa,
  decodeReachMessage,
  transferIdOf,
  reachSavingsWrapperAbi,
  reachSourceGatewayAbi,
  reachDestinationGatewayAbi,
  remoteWrapperReceiptAbi,
  wormholeCoreAbi,
  registry,
  type ReachConfig,
} from "@musd-reach/sdk";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
type Check = { group: string; name: string; ok: boolean; detail: string };
const checks: Check[] = [];
const add = (group: string, name: string, ok: boolean, detail = "") => checks.push({ group, name, ok, detail });
const eqAddr = (a?: string | null, b?: string | null) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

/** User-supplied paths resolve from where the user ran the command; `pnpm verify` runs us in packages/verifier. */
const userPath = (p: string) => resolve(process.env.INIT_CWD ?? process.cwd(), p);

function opt(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

function loadCfg(): ReachConfig {
  const o = opt("deployments");
  const p = o ? userPath(o) : join(ROOT, "deployments", "testnet.json");
  const deployments = existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
  return buildConfig({
    deployments,
    mezoRpcUrls: opt("mezo-rpc")?.split(","),
    baseRpcUrls: opt("base-rpc")?.split(","),
  });
}

async function verifyRegistry(cfg: ReachConfig, c: { mezo: PublicClient; base: PublicClient }) {
  const g = "registry";
  const [mezoId, baseId] = await Promise.all([c.mezo.getChainId(), c.base.getChainId()]);
  add(g, "Mezo EVM chain id", mezoId === cfg.mezo.evmChainId, `${mezoId}`);
  add(g, "Base Sepolia EVM chain id", baseId === cfg.base.evmChainId, `${baseId}`);

  const v = await readNativeVaultState(c.mezo, cfg);
  add(g, "native vault implementation == pinned", v.implementationMatchesRegistry, `${v.implementation} @ block ${v.blockNumber}`);
  const musd = await c.mezo.readContract({ address: cfg.mezo.savingsVault, abi: [{ type: "function", name: "musdToken", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] }] as const, functionName: "musdToken" });
  add(g, "vault underlying == pinned MUSD", eqAddr(musd, cfg.mezo.musd), musd);
  add(g, "vault pcv observed", true, `${v.pcv} (zero means no PCV fee stream configured)`);

  for (const [name, client, core, wh, evm] of [
    ["Mezo", c.mezo, cfg.mezo.wormholeCore, cfg.mezo.wormholeChainId, cfg.mezo.evmChainId],
    ["Base", c.base, cfg.base.wormholeCore, cfg.base.wormholeChainId, cfg.base.evmChainId],
  ] as const) {
    const [chainId, evmChainId, fee, gsi] = await Promise.all([
      client.readContract({ address: core, abi: wormholeCoreAbi, functionName: "chainId" }),
      client.readContract({ address: core, abi: wormholeCoreAbi, functionName: "evmChainId" }),
      client.readContract({ address: core, abi: wormholeCoreAbi, functionName: "messageFee" }),
      client.readContract({ address: core, abi: [{ type: "function", name: "getCurrentGuardianSetIndex", stateMutability: "view", inputs: [], outputs: [{ type: "uint32" }] }] as const, functionName: "getCurrentGuardianSetIndex" }),
    ]);
    add(g, `${name} Wormhole Core chain ids`, chainId === wh && evmChainId === BigInt(evm), `wormhole ${chainId}, evm ${evmChainId}`);
    add(g, `${name} Wormhole message fee`, true, `${fee} wei`);
    add(g, `${name} guardian set index`, gsi === registry.wormhole.guardianSetIndex, `${gsi}`);
  }
}

async function verifyDeployment(cfg: ReachConfig, c: { mezo: PublicClient; base: PublicClient }) {
  const g = "deployment";
  const d = cfg.deployment;
  if (!d) {
    add(g, "deployment recorded", false, "deployments/testnet.json missing or incomplete — Reach is NOT deployed");
    return;
  }
  for (const [name, client, addr] of [
    ["wrapper code", c.mezo, d.wrapper],
    ["source gateway code", c.mezo, d.sourceGateway],
    ["destination gateway code", c.base, d.destinationGateway],
    ["receipt code", c.base, d.receipt],
  ] as const) {
    const code = await client.getCode({ address: addr });
    add(g, name, !!code && code !== "0x", addr);
  }
  const w = { address: d.wrapper, abi: reachSavingsWrapperAbi } as const;
  const s = { address: d.sourceGateway, abi: reachSourceGatewayAbi } as const;
  const t = { address: d.destinationGateway, abi: reachDestinationGatewayAbi } as const;
  const [wVault, wAsset, sWrapper, sDest, sReceipt, sCore, sPeerWh, sPeerEvm, sCl] = await Promise.all([
    c.mezo.readContract({ ...w, functionName: "savingsVault" }),
    c.mezo.readContract({ ...w, functionName: "asset" }),
    c.mezo.readContract({ ...s, functionName: "shareToken" }),
    c.mezo.readContract({ ...s, functionName: "destinationGateway" }),
    c.mezo.readContract({ ...s, functionName: "remoteReceipt" }),
    c.mezo.readContract({ ...s, functionName: "wormhole" }),
    c.mezo.readContract({ ...s, functionName: "peerWormholeChainId" }),
    c.mezo.readContract({ ...s, functionName: "peerEvmChainId" }),
    c.mezo.readContract({ ...s, functionName: "consistencyLevel" }),
  ]);
  add(g, "wrapper → pinned native vault", eqAddr(wVault, cfg.mezo.savingsVault), wVault);
  add(g, "wrapper asset == MUSD", eqAddr(wAsset, cfg.mezo.musd), wAsset);
  add(g, "source → wrapper", eqAddr(sWrapper, d.wrapper), sWrapper);
  add(g, "source → destination gateway", eqAddr(sDest, d.destinationGateway), sDest);
  add(g, "source → receipt", eqAddr(sReceipt, d.receipt), sReceipt);
  add(g, "source → Mezo Wormhole Core", eqAddr(sCore, cfg.mezo.wormholeCore), sCore);
  add(g, "source peer chain ids", sPeerWh === cfg.base.wormholeChainId && sPeerEvm === BigInt(cfg.base.evmChainId), `${sPeerWh}/${sPeerEvm}`);
  add(g, "source consistency level", sCl === registry.wormhole.consistencyLevel, `${sCl}`);

  const [tSource, tReceipt, tWrapper, tCore, tPeerWh, tPeerEvm, rGateway] = await Promise.all([
    c.base.readContract({ ...t, functionName: "sourceGateway" }),
    c.base.readContract({ ...t, functionName: "receipt" }),
    c.base.readContract({ ...t, functionName: "wrapper" }),
    c.base.readContract({ ...t, functionName: "wormhole" }),
    c.base.readContract({ ...t, functionName: "peerWormholeChainId" }),
    c.base.readContract({ ...t, functionName: "peerEvmChainId" }),
    c.base.readContract({ address: d.receipt, abi: remoteWrapperReceiptAbi, functionName: "gateway" }),
  ]);
  add(g, "destination bound to source gateway (one-time)", eqAddr(tSource, d.sourceGateway), tSource);
  add(g, "destination → receipt", eqAddr(tReceipt, d.receipt), tReceipt);
  add(g, "destination → Mezo wrapper binding", eqAddr(tWrapper, d.wrapper), tWrapper);
  add(g, "destination → Base Wormhole Core", eqAddr(tCore, cfg.base.wormholeCore), tCore);
  add(g, "destination peer chain ids", tPeerWh === cfg.mezo.wormholeChainId && tPeerEvm === BigInt(cfg.mezo.evmChainId), `${tPeerWh}/${tPeerEvm}`);
  add(g, "receipt's only minter is destination gateway", eqAddr(rGateway, d.destinationGateway), rGateway);
}

/**
 * Compares deployed runtime bytecode with the local Foundry artifacts. Immutable values are
 * written into the runtime code at deploy time, so exactly the byte ranges the compiler reports
 * in `immutableReferences` are masked; every other byte must match. Requires `forge build`.
 */
async function verifyBytecode(cfg: ReachConfig, c: { mezo: PublicClient; base: PublicClient }) {
  const g = "bytecode";
  const d = cfg.deployment;
  if (!d) return;
  const out = join(ROOT, "packages", "contracts", "out");
  const targets = [
    ["ReachSavingsWrapper", c.mezo, d.wrapper],
    ["ReachSourceGateway", c.mezo, d.sourceGateway],
    ["ReachDestinationGateway", c.base, d.destinationGateway],
    ["RemoteWrapperReceipt", c.base, d.receipt],
  ] as const;
  for (const [name, client, address] of targets) {
    const file = join(out, `${name}.sol`, `${name}.json`);
    if (!existsSync(file)) {
      add(g, `${name} artifact`, false, "run `forge build` in packages/contracts first");
      continue;
    }
    const art = JSON.parse(readFileSync(file, "utf8")) as {
      deployedBytecode: { object: string; immutableReferences?: Record<string, { start: number; length: number }[]> };
    };
    const expected = art.deployedBytecode.object.replace(/^0x/, "").toLowerCase();
    const onchain = ((await client.getCode({ address })) ?? "0x").replace(/^0x/, "").toLowerCase();
    if (onchain.length !== expected.length) {
      add(g, `${name} runtime code`, false, `length ${onchain.length / 2} bytes vs artifact ${expected.length / 2}`);
      continue;
    }
    const masked = new Set<number>();
    for (const refs of Object.values(art.deployedBytecode.immutableReferences ?? {})) {
      for (const r of refs) for (let i = r.start; i < r.start + r.length; i++) masked.add(i);
    }
    let mismatch = -1;
    for (let i = 0; i < expected.length / 2; i++) {
      if (masked.has(i)) continue;
      if (expected.slice(i * 2, i * 2 + 2) !== onchain.slice(i * 2, i * 2 + 2)) {
        mismatch = i;
        break;
      }
    }
    add(g, `${name} runtime code matches artifact`, mismatch === -1, mismatch === -1 ? `${expected.length / 2} bytes, ${masked.size} immutable bytes masked` : `first mismatch at byte ${mismatch}`);
  }
}

async function verifyReconcile(cfg: ReachConfig, c: { mezo: PublicClient; base: PublicClient }) {
  if (!cfg.deployment) return;
  // `latest` only for local forks, where `finalized` resolves to the fork origin block.
  let r;
  try {
    r = await reconcile(c, cfg, { baseBlockTag: opt("base-block-tag") === "finalized" ? "finalized" : "latest" });
  } catch (e) {
    add("reconcile", "reconciliation readable", false, (e as { shortMessage?: string }).shortMessage ?? String(e).split("\n")[0]);
    return;
  }
  for (const ch of r.checks) add("reconcile", ch.name, ch.ok, ch.detail);
  add(
    "reconcile",
    "snapshot",
    true,
    `mezo block ${r.mezoBlock}, base block ${r.baseBlock}, locked ${r.totalLocked}, remote ${r.remoteSupply}, in-flight issue ${r.pendingIssueShares}, in-flight redeem ${r.pendingRedemptionShares}`,
  );
}

const EXPLORER_API = { mezo: "https://api.explorer.test.mezo.org", base: "https://base-sepolia.blockscout.com" } as const;

/** Receipt status from the chain's Blockscout explorer: an independent fallback source. */
async function explorerReceipt(chain: "mezo" | "base", hash: string): Promise<{ ok: boolean; status: string; block: bigint } | null> {
  try {
    const res = await fetch(`${EXPLORER_API[chain]}/api/v2/transactions/${hash}`, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    const j = (await res.json()) as { status?: string; result?: string; block_number?: number; block?: number };
    const block = j.block_number ?? j.block;
    if (block === undefined || block === null) return null;
    return { ok: j.status === "ok" && (j.result === undefined || j.result === "success"), status: `${j.status}/${j.result ?? "-"}`, block: BigInt(block) };
  } catch {
    return null;
  }
}

type EvidenceStep = { id: string; title: string; chain: string; txHash?: Hex; blockNumber?: string; details?: Record<string, unknown> };

async function verifyEvidence(cfg: ReachConfig, c: { mezo: PublicClient; base: PublicClient }, file: string) {
  const g = "evidence";
  const ev = JSON.parse(readFileSync(userPath(file), "utf8")) as { kind: string; steps: EvidenceStep[] };
  add(g, "evidence kind", ev.kind === "PUBLIC_TESTNET_RUN", ev.kind === "PUBLIC_TESTNET_RUN" ? ev.kind : `${ev.kind} — not public-testnet evidence`);
  const txs: { chain: string; hash: Hex; block?: string; label: string }[] = [];
  for (const s of ev.steps) {
    if (s.txHash) txs.push({ chain: s.chain, hash: s.txHash, block: s.blockNumber, label: `${s.id} ${s.title}` });
    for (const [k, v] of Object.entries(s.details ?? {})) {
      if (typeof v === "string" && /^0x[0-9a-f]{64}$/i.test(v) && /Tx$/.test(k)) txs.push({ chain: s.chain, hash: v as Hex, label: `${s.id} ${k}` });
    }
  }
  for (const t of txs) {
    const client = t.chain === "base" ? c.base : c.mezo;
    try {
      // The Mezo testnet RPC is load-balanced and ~2/3 of its backends returned null for older
      // receipts on 2026-10-21 (finding F-14); retry enough that a real absence is still caught.
      let r: Awaited<ReturnType<typeof client.getTransactionReceipt>> | undefined;
      let lastErr: unknown;
      for (let i = 0; i < 30 && !r; i++) {
        try {
          r = await client.getTransactionReceipt({ hash: t.hash });
        } catch (e) {
          lastErr = e;
          await new Promise((res) => setTimeout(res, 1500));
        }
      }
      if (!r) throw lastErr;
      add(g, `receipt ${t.label}`, r.status === "success" && (!t.block || r.blockNumber === BigInt(t.block)), `${t.hash} status ${r.status} block ${r.blockNumber} (rpc)`);
    } catch (e) {
      // Second independent source: the chain's Blockscout explorer API. Used only when the RPC
      // could not return the receipt, and labelled as such in the result.
      const ex = await explorerReceipt(t.chain === "base" ? "base" : "mezo", t.hash);
      if (ex) {
        add(g, `receipt ${t.label}`, ex.ok && (!t.block || ex.block === BigInt(t.block)), `${t.hash} status ${ex.status} block ${ex.block} (explorer; rpc returned no receipt)`);
      } else {
        add(g, `receipt ${t.label}`, false, `${t.hash}: ${(e as Error).message.split("\n")[0]}`);
      }
    }
  }
  // Re-verify each recorded VAA with the real Core on the chain that consumed it.
  for (const s of ev.steps) {
    const vaas = [s.details?.vaa, ...((s.details?.vaas as string[] | undefined) ?? [])].filter((x): x is Hex => typeof x === "string");
    for (const vaa of vaas) {
      const p = parseVaa(vaa);
      const consumerIsBase = p.emitterChainId === cfg.mezo.wormholeChainId;
      const client = consumerIsBase ? c.base : c.mezo;
      const core = consumerIsBase ? cfg.base.wormholeCore : cfg.mezo.wormholeCore;
      const [, valid, reason] = await client.readContract({ address: core, abi: wormholeCoreAbi, functionName: "parseAndVerifyVM", args: [vaa] });
      const m = decodeReachMessage(p.payload);
      const id = transferIdOf(m);
      const gw = consumerIsBase ? cfg.deployment?.destinationGateway : cfg.deployment?.sourceGateway;
      const consumed = gw
        ? await client.readContract({ address: gw, abi: reachDestinationGatewayAbi, functionName: "transferConsumed", args: [id] })
        : false;
      add(g, `VAA ${p.emitterChainId}/${p.sequence} guardian signatures (live Core)`, valid, valid ? `digest ${p.digest}` : reason);
      add(g, `VAA ${p.emitterChainId}/${p.sequence} consumed exactly once on target`, consumed, `transferId ${id}`);
    }
  }
}

async function main() {
  const cmd = process.argv[2] ?? "all";
  const cfg = loadCfg();
  const c = createReachClients(cfg);
  if (cmd === "registry" || cmd === "all") await verifyRegistry(cfg, c);
  if (cmd === "deployment" || cmd === "all") await verifyDeployment(cfg, c);
  if (cmd === "bytecode" || cmd === "all") await verifyBytecode(cfg, c);
  if (cmd === "reconcile" || cmd === "all") await verifyReconcile(cfg, c);
  const evFile = cmd === "evidence" ? process.argv[3] : cmd === "all" ? process.argv[3] : undefined;
  if (evFile && !evFile.startsWith("--")) await verifyEvidence(cfg, c, evFile);

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ checkedAt: new Date().toISOString(), checks }, null, 2));
  } else {
    let group = "";
    for (const ch of checks) {
      if (ch.group !== group) console.log(`\n== ${(group = ch.group).toUpperCase()}`);
      console.log(`  ${ch.ok ? "PASS" : "FAIL"}  ${ch.name}${ch.detail ? `  — ${ch.detail}` : ""}`);
    }
    const failed = checks.filter((x) => !x.ok).length;
    console.log(`\n${checks.length - failed} passed, ${failed} failed`);
  }
  if (checks.some((x) => !x.ok)) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 2;
});
