"use client";

import { useSyncExternalStore } from "react";

/** Transaction status pop-ups. "Done" closes by itself; "Sending" and "Failed" stay until closed. */
export type Toast = { id: number; kind: "sending" | "done" | "failed"; title: string; body?: string; href?: string; linkLabel?: string };

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function pushToast(t: Omit<Toast, "id">): number {
  const id = nextId++;
  toasts = [...toasts.slice(-3), { ...t, id }];
  emit();
  if (t.kind === "done") setTimeout(() => dismissToast(id), 8_000);
  return id;
}

export function updateToast(id: number, t: Omit<Toast, "id">) {
  if (!toasts.some((x) => x.id === id)) return pushToast(t);
  toasts = toasts.map((x) => (x.id === id ? { ...t, id } : x));
  emit();
  if (t.kind === "done") setTimeout(() => dismissToast(id), 8_000);
  return id;
}

export function dismissToast(id: number) {
  toasts = toasts.filter((x) => x.id !== id);
  emit();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const EMPTY: Toast[] = [];
export const useToasts = () => useSyncExternalStore(subscribe, () => toasts, () => EMPTY);
