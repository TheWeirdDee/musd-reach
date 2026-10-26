import { pageMetadata } from "@/lib/metadata";
import { CompactFooter } from "@/components/site/CompactFooter";
export const metadata = pageMetadata("Risks and disclosures", "Native vault, guardian, finality, liquidity and software assumptions, with current limitations.", "/risks", false);
export default function Layout({ children }: { children: React.ReactNode }) { return <>{children}<CompactFooter /></>; }
