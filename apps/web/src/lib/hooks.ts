"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import type { Address, PublicClient } from "viem";
import { readNativeVaultState, readPosition, readWrapperState, reconcile, type ReachClients } from "@musd-reach/sdk";
import { reachConfig, MEZO_ID, BASE_ID, apiUrl } from "./reach";

export function useClients(): ReachClients | null {
  const mezo = usePublicClient({ chainId: MEZO_ID });
  const base = usePublicClient({ chainId: BASE_ID });
  if (!mezo || !base) return null;
  return { mezo: mezo as PublicClient, base: base as PublicClient };
}

export function useNativeVault() {
  const c = useClients();
  return useQuery({
    queryKey: ["native-vault"],
    enabled: !!c,
    refetchInterval: 30_000,
    queryFn: () => readNativeVaultState(c!.mezo, reachConfig),
  });
}

export function useWrapper() {
  const c = useClients();
  return useQuery({
    queryKey: ["wrapper"],
    enabled: !!c && !!reachConfig.deployment,
    refetchInterval: 15_000,
    queryFn: () => readWrapperState(c!.mezo, reachConfig),
  });
}

export function usePosition(account?: Address) {
  const c = useClients();
  return useQuery({
    queryKey: ["position", account],
    enabled: !!c && !!account,
    refetchInterval: 15_000,
    queryFn: () => readPosition(c!, reachConfig, account!),
  });
}

export function useReconciliation() {
  const c = useClients();
  return useQuery({
    queryKey: ["reconciliation"],
    enabled: !!c && !!reachConfig.deployment,
    refetchInterval: 60_000,
    queryFn: () => reconcile(c!, reachConfig, { baseBlockTag: "latest" }),
  });
}

/**
 * Optional indexer API. The app works without it; history views say so when it's unreachable.
 * Free hosting sleeps the API when idle and holds the first request while it wakes (about a
 * minute), so a request may take up to 90 s before it counts as failed.
 */
export function useApi<T>(path: string | null, opts: { refetchInterval?: number } = {}) {
  return useQuery({
    queryKey: ["api", path],
    enabled: !!path && !!apiUrl,
    refetchInterval: opts.refetchInterval,
    retry: 1,
    queryFn: async (): Promise<T> => {
      const res = await fetch(`${apiUrl}${path}`, { signal: AbortSignal.timeout(90_000) });
      if (!res.ok) throw new Error(`History service responded ${res.status}`);
      return (await res.json()) as T;
    },
  });
}

export const apiConfigured = !!apiUrl;

/** True once a first API load has been pending for a few seconds, i.e. the API is probably waking. */
export function useSlowLoad(pending: boolean, afterMs = 4_000) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => setSlow(true), afterMs);
    return () => clearTimeout(t);
  }, [pending, afterMs]);
  return pending && slow;
}
