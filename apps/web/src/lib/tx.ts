"use client";

import { useCallback, useRef, useState } from "react";
import { useAccount, useConfig } from "wagmi";
import { getPublicClient, getWalletClient, switchChain } from "wagmi/actions";
import { gasLimitFor } from "@musd-reach/sdk";
import { readWalletChainId } from "./walletChain";
import { formatEther, type Abi, type Address, type Hex, type TransactionReceipt } from "viem";
import { explainError } from "./errors";
import { pushToast, updateToast } from "./toasts";
import { explorer } from "./reach";

/** Plain names for the calls the app makes, used in status pop-ups when a page gives no label. */
const ACTION: Record<string, string> = {
  approve: "Approval",
  deposit: "Deposit",
  depositWithMin: "Saving MUSD",
  depositSavings: "Moving savings",
  depositAndIssue: "Saving and sending to Base",
  depositSavingsAndIssue: "Moving savings to Base",
  lockAndIssue: "Sending savings to Base",
  redeem: "Bringing savings home",
  withdraw: "Withdrawal",
  supplyCollateral: "Posting collateral",
  withdrawCollateral: "Withdrawing collateral",
  borrow: "Borrow",
  repay: "Repayment",
  claim: "Route kit claim",
  transfer: "Bridge transfer",
  receiveMessage: "Delivery",
  completeIssue: "Delivery",
  completeRedemption: "Delivery",
  retrySettlement: "Payout retry",
  claimSharesInstead: "Taking savings shares",
};

export type TxPhase = "idle" | "switching" | "simulating" | "signing" | "pending" | "confirmed" | "rejected" | "failed";

export type TxState = { phase: TxPhase; hash?: Hex; receipt?: TransactionReceipt; error?: string };

export { explainError };

/**
 * Sends one contract write: switch chain → simulate (catches reverts before signing) → sign →
 * wait for receipt. Success means the receipt has status `success`; callers must still read
 * resulting balances before declaring a business outcome.
 */
export function useContractTx() {
  const config = useConfig();
  const { address } = useAccount();
  const [state, setState] = useState<TxState>({ phase: "idle" });
  const inFlight = useRef(false);

  const run = useCallback(
    async (
      req: { chainId: number; address: Address; abi: Abi; functionName: string; args?: readonly unknown[]; value?: bigint },
      opts: { label?: string; success?: string } = {},
    ): Promise<TransactionReceipt | null> => {
      const label = opts.label ?? ACTION[req.functionName] ?? "Transaction";
      const txLink = (h: Hex) => (req.chainId === 31611 ? explorer.mezoTx(h) : explorer.baseTx(h));
      let toastId: number | null = null;
      if (inFlight.current) return null;
      if (!address) {
        setState({ phase: "failed", error: "Connect a wallet first." });
        return null;
      }
      try {
        inFlight.current = true;
        // Ask the connector, not wagmi's stored chain, which ignores unconfigured networks (F-17).
        if ((await readWalletChainId(config)) !== req.chainId) {
          setState({ phase: "switching" });
          await switchChain(config, { chainId: req.chainId as never });
        }
        setState({ phase: "simulating" });
        const pc = getPublicClient(config, { chainId: req.chainId as never })!;
        const sim = await pc.simulateContract({ ...req, account: address } as never);
        // Wallets estimate Mezo gas through the same RPC, which omits the EIP-7623 calldata floor;
        // an under-gassed settlement reverts by design, so send an explicit limit (F-20).
        const request = (sim as unknown as { request: Record<string, unknown> }).request;
        const gas = gasLimitFor(req.chainId, await pc.estimateContractGas({ ...req, account: address } as never));
        const [balance, gasPrice] = await Promise.all([pc.getBalance({ address }), pc.getGasPrice()]);
        const required = gas * gasPrice + (req.value ?? 0n);
        if (balance < required) throw new Error(`Insufficient network gas. This call needs approximately ${formatEther(required)} ${req.chainId === 31611 ? "BTC" : "ETH"}; your balance is ${formatEther(balance)}. Refresh the quote after funding this network.`);
        setState({ phase: "signing" });
        const wallet = await getWalletClient(config, { chainId: req.chainId as never });
        if (wallet.account?.address.toLowerCase() !== address.toLowerCase()) throw new Error("The authorized wallet account changed. Review the new account and start again.");
        const hash = await wallet.writeContract({ ...request, gas } as never);
        setState({ phase: "pending", hash });
        toastId = pushToast({ kind: "sending", title: `${label}: sending`, body: "Waiting for the network to confirm it.", href: txLink(hash) });
        const receipt = await pc.waitForTransactionReceipt({ hash, timeout: 10 * 60_000 });
        if (receipt.status !== "success") {
          setState({ phase: "failed", hash, receipt, error: "The transaction was mined but reverted." });
          updateToast(toastId ?? -1, { kind: "failed", title: `${label} failed`, body: "It was included in a block but reverted. Nothing changed.", href: txLink(hash) });
          return null;
        }
        setState({ phase: "confirmed", hash, receipt });
        updateToast(toastId ?? -1, { kind: "done", title: opts.success ?? `${label}: done`, href: txLink(hash) });
        return receipt;
      } catch (e) {
        const { rejected, message } = explainError(e);
        setState((s) => ({ phase: rejected ? "rejected" : "failed", hash: s.hash, error: message }));
        // A cancel in the wallet is the person's own choice; only real failures pop up.
        if (!rejected) {
          if (toastId !== null) updateToast(toastId, { kind: "failed", title: `${label} failed`, body: message });
          else pushToast({ kind: "failed", title: `${label} failed`, body: message });
        } else if (toastId !== null) updateToast(toastId, { kind: "failed", title: `${label} cancelled`, body: message });
        return null;
      } finally {
        inFlight.current = false;
      }
    },
    [address, config],
  );

  return { state, run, reset: () => setState({ phase: "idle" }) };
}

export const phaseLabel: Record<TxPhase, string> = {
  idle: "Ready",
  switching: "Switch network in your wallet",
  simulating: "Checking the call against current chain state",
  signing: "Confirm in your wallet",
  pending: "Submitted, waiting for the block",
  confirmed: "Confirmed on-chain",
  rejected: "Rejected in wallet",
  failed: "Failed",
};
