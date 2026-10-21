"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import type { Config } from "wagmi";
import { getAccount } from "wagmi/actions";

/**
 * The chain the wallet is actually on, read from the connector. wagmi's stored chain only follows
 * configured chains, so a wallet on an unconfigured network (a fresh MetaMask on Ethereum
 * mainnet) would otherwise be reported as Mezo testnet and never asked to switch (F-17).
 */
export async function readWalletChainId(config: Config): Promise<number | undefined> {
  const { connector } = getAccount(config);
  return connector ? await connector.getChainId() : undefined;
}

export function useWalletChainId(): number | undefined {
  const { connector, chainId: connectionChainId, status } = useAccount();
  // Keyed by connector so a stale reading from a previous connection is never returned.
  const [reading, setReading] = useState<{ uid: string; chainId: number } | null>(null);
  const active = status === "connected" ? connector : undefined;

  useEffect(() => {
    if (!active) return;
    let live = true;
    const set = (chainId: number) => live && setReading({ uid: active.uid, chainId });
    active.getChainId().then(set, () => {});
    const onChange = (data: { chainId?: number }) => data.chainId !== undefined && set(data.chainId);
    active.emitter.on("change", onChange);
    return () => {
      live = false;
      active.emitter.off("change", onChange);
    };
  }, [active, connectionChainId]);

  return active && reading?.uid === active.uid ? reading.chainId : undefined;
}
