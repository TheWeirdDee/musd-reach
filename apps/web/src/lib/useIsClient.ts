import { useSyncExternalStore } from "react";

const noop = () => () => {};

/** true after hydration, false during SSR, without a setState-in-effect round trip. */
export function useIsClient() {
  return useSyncExternalStore(noop, () => true, () => false);
}

/** Current unix time in seconds, refreshed on an interval. */
export function useNow(intervalMs = 5000) {
  return useSyncExternalStore(
    (cb) => {
      const t = setInterval(cb, intervalMs);
      return () => clearInterval(t);
    },
    // Bucketed so repeated snapshot reads within one interval return the same value.
    () => Math.floor(Date.now() / intervalMs) * (intervalMs / 1000),
    () => 0,
  );
}
