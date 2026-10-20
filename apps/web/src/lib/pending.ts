"use client";

import { useMemo, useSyncExternalStore } from "react";
import type { Hex } from "viem";

/** Local record of transfers this browser started, so a refresh or closed tab never loses one. */
export type LocalTransfer = {
  transferId: Hex;
  direction: "ISSUE" | "REDEEM";
  originTx: Hex;
  sequence: string;
  shares: string;
  recipient: string;
  account: string;
  mode?: number;
  createdAt: number;
};

const KEY = "musd-reach:transfers:v1";

function read(): LocalTransfer[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as LocalTransfer[]) : [];
  } catch {
    return [];
  }
}

export function saveLocalTransfer(t: LocalTransfer) {
  try {
    const all = read().filter((x) => x.transferId !== t.transferId);
    all.unshift(t);
    localStorage.setItem(KEY, JSON.stringify(all.slice(0, 100)));
    window.dispatchEvent(new Event("musd-reach:transfers"));
  } catch {
    /* storage unavailable (private mode); the tracker URL still carries the origin tx */
  }
}

function subscribe(cb: () => void) {
  window.addEventListener("musd-reach:transfers", cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener("musd-reach:transfers", cb);
    window.removeEventListener("storage", cb);
  };
}

function snapshot(): string {
  try {
    return localStorage.getItem(KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

export function useLocalTransfers(account?: string) {
  const raw = useSyncExternalStore(subscribe, snapshot, () => "[]");
  return useMemo(() => {
    let all: LocalTransfer[] = [];
    try {
      all = JSON.parse(raw) as LocalTransfer[];
    } catch {
      all = [];
    }
    return all.filter((t) => !account || t.account.toLowerCase() === account.toLowerCase());
  }, [raw, account]);
}

export function findLocalTransfer(id: string): LocalTransfer | undefined {
  return read().find((t) => t.transferId.toLowerCase() === id.toLowerCase());
}
