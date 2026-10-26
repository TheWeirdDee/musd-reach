import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { Inter_Tight, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { SiteHeader } from "@/components/site/SiteHeader";
import { WalletSafetyNotice } from "@/components/site/WalletSafetyNotice";
import { SITE_URL } from "@/lib/metadata";

const interTight = Inter_Tight({ subsets: ["latin"], variable: "--font-inter-tight", display: "swap" });
const instrumentSerif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-instrument-serif", display: "swap" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains-mono", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "MUSD Reach — Your Mezo savings, beyond Mezo", template: "%s · MUSD Reach" },
  description:
    "Keep MUSD principal in Mezo's native savings vault and carry a backed, transferable claim on it to Base. Authenticated by Wormhole guardians, redeemable by burning, verifiable on-chain.",
  applicationName: "MUSD Reach",
  alternates: { canonical: "/" },
  manifest: "/manifest.webmanifest",
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/icons/reach-192.png", sizes: "192x192", type: "image/png" }], apple: [{ url: "/apple-icon.png", sizes: "180x180" }] },
  openGraph: { type: "website", siteName: "MUSD Reach", title: "MUSD Reach — Mezo savings, beyond Mezo", description: "Portable, verifiable claims on native Mezo savings. Experimental testnets; no independent audit.", url: "/", images: [{ url: "/opengraph-image", width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image", title: "MUSD Reach", description: "Your Mezo savings. A verifiable claim on Base.", images: ["/opengraph-image"] },
};

export const viewport: Viewport = {
  themeColor: "#0b0b0a",
  colorScheme: "dark",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Render per request so Next.js can put the proxy's CSP nonce on its scripts (src/proxy.ts).
  await connection();
  return (
    <html lang="en" className={`${interTight.variable} ${instrumentSerif.variable} ${jetbrainsMono.variable}`}>
      <body className="bg-ink-950 text-bone-100 antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-sm focus:bg-ember-500 focus:px-4 focus:py-2 focus:text-ink-950">
          Skip to content
        </a>
        <Providers>
          <SiteHeader />
          <WalletSafetyNotice />
          <main id="main">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
