import { pageMetadata } from "@/lib/metadata";
import { CompactFooter } from "@/components/site/CompactFooter";
export const metadata = pageMetadata("Proof explorer", "Explore recorded public-testnet lifecycles, historical v1, current v2 and live cross-chain backing.", "/proof", false);
export default function Layout({ children }: { children: React.ReactNode }) { return <>{children}<CompactFooter /></>; }
