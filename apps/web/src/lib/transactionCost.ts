"use client";
import { useQuery } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import type { Abi, Address } from "viem";
import { gasLimitFor } from "@musd-reach/sdk";
import { useClients } from "./hooks";
import { MEZO_ID } from "./reach";
export type TransactionIntent = { chainId: number; address: Address; abi: Abi; functionName: string; args: readonly unknown[]; value?: bigint };
export function useTransactionCost(intent: TransactionIntent | null) {
  const clients = useClients();
  const { address } = useAccount();
  const key = intent ? JSON.stringify({ ...intent, abi: undefined }, (_, v) => typeof v === "bigint" ? v.toString() : v) : null;
  return useQuery({ queryKey: ["transaction-cost", address, key], enabled: !!intent && !!clients && !!address, retry: 1, refetchInterval: 15_000, queryFn: async () => {
    const client = intent!.chainId === MEZO_ID ? clients!.mezo : clients!.base;
    const [estimate, price, balance] = await Promise.all([client.estimateContractGas({ ...intent!, account: address! } as never), client.getGasPrice(), client.getBalance({ address: address! })]);
    const gas = gasLimitFor(intent!.chainId, estimate);
    const budget = gas * price + (intent!.value ?? 0n);
    return { gas, price, balance, budget, sufficient: balance >= budget };
  } });
}
