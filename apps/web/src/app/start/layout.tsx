import { pageMetadata } from "@/lib/metadata";
import { CompactFooter } from "@/components/site/CompactFooter";
export const metadata = pageMetadata("Try MUSD Reach", "Ten-minute testnet guide: lend USDC, or save on Mezo and borrow on Base against your savings.", "/start", false);
export default function Layout({ children }: { children: React.ReactNode }) { return <>{children}<CompactFooter /></>; }
