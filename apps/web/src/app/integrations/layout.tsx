import { pageMetadata } from "@/lib/metadata";
import { CompactFooter } from "@/components/site/CompactFooter";
export const metadata = pageMetadata("Integration status", "What rwSMUSD supports, what is fork-tested, and what is not publicly available.", "/integrations", false);
export default function Layout({ children }: { children: React.ReactNode }) { return <>{children}<CompactFooter /></>; }
