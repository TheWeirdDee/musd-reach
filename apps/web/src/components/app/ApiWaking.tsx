import { Notice } from "@/components/ui/primitives";

/** Shown while the optional history API is slow to answer, usually because it is waking from sleep. */
export function ApiWakingNotice({ className }: { className?: string }) {
  return (
    <Notice tone="pending" title="Waking the history service" className={className}>
      It runs on free hosting that sleeps when idle, so the first request can take up to a minute. Balances, backing and every on-chain action read the chains directly and do not wait for it.
    </Notice>
  );
}
