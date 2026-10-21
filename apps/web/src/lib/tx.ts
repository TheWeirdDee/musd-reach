"use client";

import { useCallback, useState } from "react";
import { useAccount, useConfig } from "wagmi";
import { getPublicClient, getWalletClient, switchChain } from "wagmi/actions";
import { readWalletChainId } from "./walletChain";
import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError, type Abi, type Address, type Hex, type TransactionReceipt } from "viem";

export type TxPhase = "idle" | "switching" | "simulating" | "signing" | "pending" | "confirmed" | "rejected" | "failed";

export type TxState = { phase: TxPhase; hash?: Hex; receipt?: TransactionReceipt; error?: string };

/** Human-readable reason; never hides the underlying error. */
export function explainError(e: unknown): { rejected: boolean; message: string } {
  if (e instanceof BaseError) {
    if (e.walk((x) => x instanceof UserRejectedRequestError)) return { rejected: true, message: "You rejected the request in your wallet. Nothing was sent." };
    const rev = e.walk((x) => x instanceof ContractFunctionRevertedError);
    if (rev instanceof ContractFunctionRevertedError) {
      const name = rev.data?.errorName;
      const map: Record<string, string> = {
        ERC20InsufficientBalance: "Insufficient token balance for this amount.",
        ERC20InsufficientAllowance: "The approval is lower than this amount. Approve again.",
        SlippageExceeded: "The wrapper's NAV moved past your minimum. Refresh the quote and try again.",
        DepositsArePaused: "New deposits are paused by the guardian. Exits are still open.",
        ERC4626ExceededMaxDeposit: "New deposits are paused by the guardian. Exits are still open.",
        IssuanceIsPaused: "New locks are paused by the guardian. Redemptions still release.",
        AlreadyConsumed: "This message was already delivered. Nothing more to do.",
        ZeroShares: "Amount too small: it would mint zero shares.",
        ZeroAssets: "Amount too small: it would pay out zero.",
        InvalidVaa: "The message signature did not verify.",
        PeerNotSet: "Reach gateways are not bound yet.",
      };
      return { rejected: false, message: (name && map[name]) ?? `Contract rejected the call${name ? `: ${name}` : ""}. ${rev.reason ?? ""}`.trim() };
    }
    if (/insufficient funds/i.test(e.message)) return { rejected: false, message: "Not enough gas on this network to pay for the transaction." };
    return { rejected: false, message: e.shortMessage };
  }
  return { rejected: false, message: e instanceof Error ? e.message.split("\n")[0]! : String(e) };
}

/**
 * Sends one contract write: switch chain → simulate (catches reverts before signing) → sign →
 * wait for receipt. Success means the receipt has status `success`; callers must still read
 * resulting balances before declaring a business outcome.
 */
export function useContractTx() {
  const config = useConfig();
  const { address } = useAccount();
  const [state, setState] = useState<TxState>({ phase: "idle" });

  const run = useCallback(
    async (req: { chainId: number; address: Address; abi: Abi; functionName: string; args?: readonly unknown[]; value?: bigint }): Promise<TransactionReceipt | null> => {
      if (!address) {
        setState({ phase: "failed", error: "Connect a wallet first." });
        return null;
      }
      try {
        // Ask the connector, not wagmi's stored chain, which ignores unconfigured networks (F-17).
        if ((await readWalletChainId(config)) !== req.chainId) {
          setState({ phase: "switching" });
          await switchChain(config, { chainId: req.chainId as never });
        }
        setState({ phase: "simulating" });
        const pc = getPublicClient(config, { chainId: req.chainId as never })!;
        const sim = await pc.simulateContract({ ...req, account: address } as never);
        setState({ phase: "signing" });
        const wallet = await getWalletClient(config, { chainId: req.chainId as never });
        const hash = await wallet.writeContract((sim as unknown as { request: never }).request);
        setState({ phase: "pending", hash });
        const receipt = await pc.waitForTransactionReceipt({ hash, timeout: 10 * 60_000 });
        if (receipt.status !== "success") {
          setState({ phase: "failed", hash, receipt, error: "The transaction was mined but reverted." });
          return null;
        }
        setState({ phase: "confirmed", hash, receipt });
        return receipt;
      } catch (e) {
        const { rejected, message } = explainError(e);
        setState((s) => ({ phase: rejected ? "rejected" : "failed", hash: s.hash, error: message }));
        return null;
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
