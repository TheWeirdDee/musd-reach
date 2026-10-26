"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { useState, type ReactNode } from "react";
import { wagmiConfig } from "@/lib/wagmi";

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
    // Only connectors the user actually used are persisted, so a refresh restores the wallet that
    // was chosen rather than picking another one.
    <WagmiProvider config={wagmiConfig} reconnectOnMount>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
