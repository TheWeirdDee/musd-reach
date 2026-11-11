import { pageMetadata } from "@/lib/metadata";
export const metadata = pageMetadata("Borrow against Mezo savings", "Post rwSMUSD as Morpho Blue collateral on Base and borrow USDC while the savings keep earning on Mezo.", "/app/borrow", true);
export default function Layout({ children }: { children: React.ReactNode }) { return <>{children}</>; }
