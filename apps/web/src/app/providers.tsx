"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { useState, type ReactNode } from "react";
import { wagmiConfig } from "@/lib/wagmi";
import { walletSafetyHold } from "@/lib/walletSafety";

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
    <WagmiProvider config={wagmiConfig} reconnectOnMount={!walletSafetyHold}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
