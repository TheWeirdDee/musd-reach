"use client";
import { useSwitchChain } from "wagmi";
import { formatEther } from "viem";
import { useWalletChainId } from "@/lib/walletChain";
import { MEZO_ID } from "@/lib/reach";
import { Button, Notice } from "@/components/ui/primitives";
import type { useTransactionCost } from "@/lib/transactionCost";
export function readinessLabel(position: { isSuccess: boolean; isError: boolean }, cost: ReturnType<typeof useTransactionCost>): string | null {
  if (!position.isSuccess) return position.isError ? "Balance read unavailable" : "Reading balances";
  if (!cost.isSuccess) return cost.isError ? "Estimate unavailable" : "Estimating transaction";
  if (!cost.data.sufficient) return "Insufficient network gas";
  return null;
}
export function TransactionReadiness({ chainId, cost }: { chainId: number; cost: ReturnType<typeof useTransactionCost> }) {
  const actual = useWalletChainId();
  const switcher = useSwitchChain();
  const chain = chainId === MEZO_ID ? "Mezo testnet" : "Base Sepolia";
  const unit = chainId === MEZO_ID ? "BTC" : "ETH";
  return <div className="space-y-3">{actual !== chainId && <Notice tone="pending" title={`This action needs ${chain}`}><p className="mb-3">{actual === undefined ? "Checking the wallet network." : `Your wallet is on chain ${actual}. Switch before preparing the transaction.`}</p><Button intent="secondary" busy={switcher.isPending} onClick={() => switcher.switchChain({ chainId })}>Switch to {chain}</Button>{switcher.error && <p className="mt-2 text-xs" role="alert">{/rejected|denied/i.test(switcher.error.message) ? "Network switch rejected. Nothing was sent." : switcher.error.message.split("\n")[0]}</p>}</Notice>}{cost.isFetching && !cost.isSuccess && <p className="text-xs text-ink-300" role="status">Estimating the exact next call and reading your network gas balance…</p>}{cost.isSuccess && <p className={`text-xs leading-6 ${cost.data.sufficient ? "text-ink-300" : "text-rust-300"}`}>Next transaction budget: {formatEther(cost.data.budget)} {unit}, including any attached message fee. Available: {formatEther(cost.data.balance)} {unit}. Estimated with a gas safety limit; the actual fee can differ.</p>}{cost.isError && <Notice tone="pending" title="Transaction estimate unavailable">The exact next call could not be estimated. Check token balance, allowance and network gas; no transaction is enabled using a guessed cost.</Notice>}</div>;
}
