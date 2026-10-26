import { pageMetadata } from "@/lib/metadata";
import { CompactFooter } from "@/components/site/CompactFooter";
export const metadata = pageMetadata("Protocol status", "Separate RPC, API, indexer, messaging, freshness and live backing observations.", "/status", false);
export default function Layout({ children }: { children: React.ReactNode }) { return <>{children}<CompactFooter /></>; }
