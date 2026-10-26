"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, useConnectors, useReconnect } from "wagmi";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { wagmiConfig } from "@/lib/wagmi";

/** Restore only the wallet the user selected. Wagmi's default reconnect scans every
 * authorized connector and can otherwise fall through to a different installed wallet.
 */
function RestoreSelectedWallet() {
  const connectors = useConnectors();
  const { reconnect } = useReconnect();
  const [selected, setSelected] = useState<string | null>(null);
  const attempted = useRef(false);
  useEffect(() => {
    let live = true;
    Promise.resolve(wagmiConfig.storage?.getItem("recentConnectorId"))
      .then((id) => { if (live) setSelected(id ?? null); }).catch(() => {});
    return () => { live = false; };
  }, []);
  useEffect(() => {
    if (!selected || selected === "injected" || attempted.current) return;
    const target = connectors.find((connector) => connector.id === selected);
    if (!target) return; // A removed extension must not restore another wallet instead.
    attempted.current = true;
    if (wagmiConfig.state.status === "disconnected") reconnect({ connectors: [target] });
  }, [connectors, selected, reconnect]);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Chain reads are refreshed, never invented: on failure we show the error state.
            retry: 2,
            refetchOnWindowFocus: true,
            staleTime: 8_000,
          },
        },
      }),
  );
  return (
    <WagmiProvider config={wagmiConfig} reconnectOnMount={false}>
      <QueryClientProvider client={queryClient}>
        <RestoreSelectedWallet />
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
