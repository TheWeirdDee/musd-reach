"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { erc20Abi, isAddress, type Address, type TransactionReceipt } from "viem";
import { reachSavingsWrapperAbi, reachSourceGatewayAbi, musdSavingsRateAbi, formatAmount } from "@musd-reach/sdk";
import { parseLock } from "@/lib/events";
import { Amount, Button, Chip, Hash, Notice, Panel, Row, Arrow } from "@/components/ui/primitives";
import { PageTitle, NotDeployedNotice, ConnectPrompt, useGate, AmountField, useAmount, StepList, NetworkHint } from "@/components/app/AppKit";
import { useClients, usePosition } from "@/lib/hooks";
import { useContractTx } from "@/lib/tx";
import { saveLocalTransfer } from "@/lib/pending";
import { reachConfig, explorer, MEZO_ID } from "@/lib/reach";
import { cn } from "@/lib/cn";

const SLIPPAGE_BPS = 50n; // NAV only rises with yield; 0.5% tolerates yield landing between quote and inclusion

export default function WrapPage() {
  const { address, connected, deployed } = useGate();
  const d = reachConfig.deployment;
  const clients = useClients();
  const qc = useQueryClient();
  const router = useRouter();
  const pos = usePosition(address);
  const [asset, setAsset] = useState<"musd" | "smusd">("musd");
  const [portable, setPortable] = useState(true);
  const [recipientInput, setRecipient] = useState<string | null>(null);
  // Defaults to the connected account until the user edits it.
  const recipient = recipientInput ?? address ?? "";
  const amount = useAmount();
  const approve = useContractTx();
  const exec = useContractTx();
  const claim = useContractTx();
  const [result, setResult] = useState<{ shares: bigint; transferId?: string; tx: string } | null>(null);


  const token = asset === "musd" ? reachConfig.mezo.musd : reachConfig.mezo.savingsVault;
  const spender = d ? (portable ? d.sourceGateway : d.wrapper) : undefined;
  const balance = pos.data ? (asset === "musd" ? pos.data.musd : pos.data.nativeSmusd) : null;

  const quote = useQuery({
    queryKey: ["wrap-quote", asset, amount.parsed?.toString(), spender, address],
    enabled: !!clients && !!d && !!amount.parsed && !!address,
    refetchInterval: 15_000,
    queryFn: async () => {
      const mezo = clients!.mezo;
      const blockNumber = await mezo.getBlockNumber();
      const [shares, allowance, fee, paused, issuancePaused] = await Promise.all([
        mezo.readContract({ address: d!.wrapper, abi: reachSavingsWrapperAbi, functionName: asset === "musd" ? "previewDeposit" : "previewDepositSavings", args: [amount.parsed!], blockNumber }),
        mezo.readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [address!, spender!], blockNumber }),
        mezo.readContract({ address: d!.sourceGateway, abi: reachSourceGatewayAbi, functionName: "messageFee", blockNumber }),
        mezo.readContract({ address: d!.wrapper, abi: reachSavingsWrapperAbi, functionName: "depositsPaused", blockNumber }),
        mezo.readContract({ address: d!.sourceGateway, abi: reachSourceGatewayAbi, functionName: "issuancePaused", blockNumber }),
      ]);
      return { shares, minShares: (shares * (10_000n - SLIPPAGE_BPS)) / 10_000n, allowance, fee, paused, issuancePaused, blockNumber };
    },
  });
  const q = quote.data;
  const needsApproval = !!q && !!amount.parsed && q.allowance < amount.parsed;
  const recipientOk = !portable || isAddress(recipient);
  const overBalance = balance !== null && amount.parsed !== null && amount.parsed > balance;
  const blocked = !deployed || !connected || !amount.parsed || !q || overBalance || !recipientOk || q.paused || (portable && q.issuancePaused);

  async function submit() {
    if (!d || !amount.parsed || !q) return;
    if (needsApproval) {
      // Exact-amount approval: never unlimited.
      const r = await approve.run({ chainId: MEZO_ID, address: token, abi: erc20Abi, functionName: "approve", args: [spender!, amount.parsed] });
      if (!r) return;
    }
    let receipt: TransactionReceipt | null;
    if (portable) {
      receipt = await exec.run({
        chainId: MEZO_ID,
        address: d.sourceGateway,
        abi: reachSourceGatewayAbi,
        functionName: asset === "musd" ? "depositAndIssue" : "depositSavingsAndIssue",
        args: [amount.parsed, recipient as Address, q.minShares],
        value: q.fee,
      });
    } else {
      receipt = await exec.run({
        chainId: MEZO_ID,
        address: d.wrapper,
        abi: reachSavingsWrapperAbi,
        functionName: asset === "musd" ? "depositWithMin" : "depositSavings",
        args: [amount.parsed, address!, q.minShares],
      });
    }
    if (!receipt) return;
    await qc.invalidateQueries({ queryKey: ["position"] });
    if (portable) {
      const lock = parseLock(receipt, d.sourceGateway);
      if (lock) {
        saveLocalTransfer({
          transferId: lock.transferId!,
          direction: "ISSUE",
          originTx: receipt.transactionHash,
          sequence: lock.sequence!.toString(),
          shares: lock.shares!.toString(),
          recipient: lock.recipient!,
          account: address!,
          createdAt: Date.now(),
        });
        setResult({ shares: lock.shares!, transferId: lock.transferId!, tx: receipt.transactionHash });
        router.push(`/app/transfers/${lock.transferId}?tx=${receipt.transactionHash}&dir=ISSUE&seq=${lock.sequence}`);
        return;
      }
    }
    setResult({ shares: q.shares, tx: receipt.transactionHash });
  }

  const busy = ["switching", "simulating", "signing", "pending"].includes(approve.state.phase) || ["switching", "simulating", "signing", "pending"].includes(exec.state.phase);

  return (
    <>
      <PageTitle kicker="Wrap" title="Put savings to work, then take the claim anywhere">
        Deposit MUSD (or existing sMUSD) into Mezo&apos;s native savings vault through the Reach wrapper. Keep the wSMUSD shares on Mezo, or lock them and receive rwSMUSD on Base in the same transaction.
      </PageTitle>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="space-y-6">
          {!deployed && <NotDeployedNotice />}
          <Panel className="space-y-6 p-6">
            <fieldset>
              <legend className="kicker mb-3 text-ink-300">You deposit</legend>
              <div className="grid grid-cols-2 gap-2" role="radiogroup">
                {(["musd", "smusd"] as const).map((a) => (
                  <button key={a} type="button" role="radio" aria-checked={asset === a} onClick={() => setAsset(a)} className={cn("rounded-sm border px-4 py-3 text-left transition-colors", asset === a ? "border-ember-500 bg-ember-500/[0.06]" : "border-ink-600 hover:border-ink-400")}>
                    <span className="block font-medium text-bone-50">{a === "musd" ? "MUSD" : "Existing sMUSD"}</span>
                    <span className="mt-0.5 block text-xs text-ink-300">{a === "musd" ? "Deposited into the native vault for you" : "Wrap principal you already hold"}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            <AmountField id="wrap-amount" label="Amount" unit={asset === "musd" ? "MUSD" : "sMUSD"} value={amount.value} onChange={amount.setValue} max={connected ? balance : undefined} disabled={!deployed} />

            {asset === "smusd" && pos.data && pos.data.nativeClaimableYield > 0n && (
              <Notice tone="info" title="Your accrued native yield stays with you">
                <p>
                  You have <Amount value={pos.data.nativeClaimableYield} unit="MUSD" places={6} /> of native yield in your own account. Wrapping does not move it; the wrapper only earns on this principal from now on. You can claim it to your wallet first:
                </p>
                <Button intent="secondary" className="mt-3" busy={["signing", "pending", "simulating", "switching"].includes(claim.state.phase)} onClick={async () => { await claim.run({ chainId: MEZO_ID, address: reachConfig.mezo.savingsVault, abi: musdSavingsRateAbi, functionName: "claimYield" }); qc.invalidateQueries({ queryKey: ["position"] }); }}>
                  Claim my native yield
                </Button>
                {claim.state.phase === "confirmed" && <p className="mt-2 text-xs text-sage-300">Claimed. Your MUSD balance above reflects the actual amount.</p>}
                {claim.state.error && <p className="mt-2 text-xs text-rust-300">{claim.state.error}</p>}
              </Notice>
            )}

            <fieldset>
              <legend className="kicker mb-3 text-ink-300">Then</legend>
              <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">
                {[
                  { v: true, t: "Make portable to Base", s: "Lock shares, receive rwSMUSD on Base" },
                  { v: false, t: "Keep wSMUSD on Mezo", s: "Shares stay in your wallet" },
                ].map((o) => (
                  <button key={String(o.v)} type="button" role="radio" aria-checked={portable === o.v} onClick={() => setPortable(o.v)} className={cn("rounded-sm border px-4 py-3 text-left transition-colors", portable === o.v ? "border-ember-500 bg-ember-500/[0.06]" : "border-ink-600 hover:border-ink-400")}>
                    <span className="block font-medium text-bone-50">{o.t}</span>
                    <span className="mt-0.5 block text-xs text-ink-300">{o.s}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            {portable && (
              <div>
                <label htmlFor="recipient" className="text-sm text-ink-300">
                  Recipient on Base Sepolia
                </label>
                <input id="recipient" value={recipient} onChange={(e) => setRecipient(e.target.value.trim())} spellCheck={false} placeholder="0x…" aria-invalid={!recipientOk && recipient !== ""} aria-describedby={!recipientOk && recipient !== "" ? "recipient-error" : undefined} className={cn("num mt-2 h-11 w-full rounded-sm border bg-ink-950 px-3 text-sm text-bone-100 outline-none focus:border-ember-500", recipientOk || !recipient ? "border-ink-600" : "border-rust-500")} />
                {!recipientOk && recipient !== "" && <p id="recipient-error" className="mt-2 text-xs text-rust-300">Enter a valid address. Receipts sent to a wrong address cannot be recovered by anyone.</p>}
              </div>
            )}
          </Panel>

          {!connected && <ConnectPrompt what="wrap savings" />}
        </div>

        <div className="space-y-6">
          <Panel className="p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold tracking-[-0.02em] text-bone-50">Review before signing</h2>
              {q && <span className="num text-xs text-ink-400">quote @ block {q.blockNumber.toString()}</span>}
            </div>
            <dl className="mt-4">
              <Row label="Source chain">Mezo testnet (31611)</Row>
              <Row label="Destination">{portable ? "Base Sepolia (84532)" : "Your wallet on Mezo"}</Row>
              <Row label="Asset">{asset === "musd" ? "MUSD" : "native sMUSD principal"}</Row>
              <Row label="Amount">{amount.parsed ? <Amount value={amount.parsed} unit={asset === "musd" ? "MUSD" : "sMUSD"} places={6} /> : "—"}</Row>
              <Row label="Expected shares" hint="At current wrapper NAV">{q ? <Amount value={q.shares} unit={portable ? "rwSMUSD" : "wSMUSD"} places={6} /> : "—"}</Row>
              <Row label="Minimum shares" hint="Reverts below this (0.5%)">{q ? <Amount value={q.minShares} unit="" places={6} /> : "—"}</Row>
              <Row label="Reach fee">None</Row>
              <Row label="Wormhole message fee">{q ? (portable ? `${formatAmount(q.fee, 18, 8)} BTC` : "—") : "—"}</Row>
              <Row label="Gas">{portable ? "Mezo now; Base Sepolia when the message is delivered" : "Mezo testnet only"}</Row>
              <Row label="Approval scope" hint="Exact amount, to one contract">{spender ? <Hash value={spender} href={explorer.mezoAddress(spender)} /> : "—"}</Row>
            </dl>
            <ul className="mt-5 space-y-2 border-t border-ink-700 pt-5 text-xs leading-relaxed text-ink-300">
              <li>· wSMUSD value can rise with real vault yield or fall if the native vault is impaired. No APY or peg is promised.</li>
              {portable && <li>· Shares are locked until a matching rwSMUSD burn is verified. There is no timeout refund; a delayed message can always be delivered later.</li>}
              {portable && <li>· Cross-chain messages rely on Wormhole guardians (one guardian key on testnet).</li>}
              <li>· Testnet software without an independent audit.</li>
            </ul>
          </Panel>

          <Panel className="space-y-4 p-6">
            <StepList
              steps={[
                { key: "approve", title: `Approve exactly ${amount.parsed ? formatAmount(amount.parsed, 18, 6) : "the amount"} ${asset === "musd" ? "MUSD" : "sMUSD"}`, chain: "Mezo testnet", state: approve.state, done: approve.state.phase === "confirmed" || (!!q && !needsApproval && !!amount.parsed), skipped: !!q && !needsApproval && approve.state.phase === "idle" },
                { key: "exec", title: portable ? "Deposit, wrap, lock and publish the ISSUE message" : "Deposit and mint wSMUSD", chain: "Mezo testnet", state: exec.state, done: exec.state.phase === "confirmed" },
              ]}
            />
            {q?.paused && <Notice tone="pending">New deposits are paused by the guardian. Exits remain open.</Notice>}
            {portable && q?.issuancePaused && <Notice tone="pending">New locks are paused by the guardian. Redemptions still release.</Notice>}
            {quote.isError && <Notice tone="failed">Could not fetch a quote: {(quote.error as Error).message.split("\n")[0]}</Notice>}
            <Button className="w-full" size="lg" disabled={blocked} busy={busy} onClick={submit}>
              {!deployed ? "Unavailable until deployment" : !connected ? "Connect a wallet" : !amount.parsed ? "Enter an amount" : overBalance ? "Insufficient balance" : needsApproval ? "Approve, then deposit" : portable ? "Deposit and make portable" : "Deposit"}
            </Button>
            <NetworkHint chainId={MEZO_ID} />
            {result && !result.transferId && (
              <Notice tone="verified" title="Deposit confirmed">
                Transaction <Hash value={result.tx} href={explorer.mezoTx(result.tx)} />. Your wSMUSD balance in the{" "}
                <Link href="/app" className="underline underline-offset-4">
                  portfolio
                </Link>{" "}
                is read from chain.
              </Notice>
            )}
            {portable && (
              <p className="text-xs text-ink-400">
                After signing you land on a tracker for this transfer. <Chip tone="neutral">Locked ≠ received</Chip> until Base verifies the message.
              </p>
            )}
          </Panel>
          <Link href="/app/portable/new" className="inline-flex items-center gap-2 text-sm text-ink-300 hover:text-bone-100">
            Already hold wSMUSD? Lock existing shares <Arrow />
          </Link>
        </div>
      </div>
    </>
  );
}
