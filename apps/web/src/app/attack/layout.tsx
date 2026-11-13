import { pageMetadata } from "@/lib/metadata";
import { CompactFooter } from "@/components/site/CompactFooter";

export const metadata = pageMetadata("Attack the bridge", "Run real attacks on the MUSD Reach route, Mezo to Wormhole to Base, against the live testnet contracts. Simulated, so nothing is sent; watch each one get refused.", "/attack", false);

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <CompactFooter />
    </>
  );
}
