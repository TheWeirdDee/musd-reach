import { pageMetadata } from "@/lib/metadata";
import { CompactFooter } from "@/components/site/CompactFooter";

export const metadata = pageMetadata("Route passport", "Travel the MUSD Reach route on testnet, Mezo to Base and home again, and collect a stamp for every leg, proven by on-chain events.", "/passport", false);

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <CompactFooter />
    </>
  );
}
