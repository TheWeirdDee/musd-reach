import { pageMetadata } from "@/lib/metadata";
export const metadata = pageMetadata("Lend to Mezo savers", "Deposit USDC into the Reach USDC Vault on Base; it lends into the rwSMUSD market backed by Mezo savings.", "/app/lend", true);
export default function Layout({ children }: { children: React.ReactNode }) { return <>{children}</>; }
