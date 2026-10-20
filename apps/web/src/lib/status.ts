import type { Tone } from "@/components/ui/primitives";

export const statusTone: Record<string, Tone> = {
  LIVE: "verified",
  PUBLIC_TESTNET_VERIFIED: "verified",
  FORK_COMPATIBILITY: "accent",
  PENDING_PUBLIC_RUN: "pending",
  RESEARCH: "neutral",
  NOT_INTEGRATED: "neutral",
  SEPARATE_PROTOCOL: "info",
};
export const statusLabel: Record<string, string> = {
  LIVE: "Live",
  PUBLIC_TESTNET_VERIFIED: "Testnet verified",
  FORK_COMPATIBILITY: "Fork-tested only",
  PENDING_PUBLIC_RUN: "Pending public run",
  RESEARCH: "Research",
  NOT_INTEGRATED: "Not integrated",
  SEPARATE_PROTOCOL: "Separate protocol",
};

