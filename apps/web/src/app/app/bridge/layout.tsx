import { pageMetadata } from "@/lib/metadata";
export const metadata = pageMetadata("Bridge MUSD between Mezo and Base", "Move MUSD between Mezo testnet and Base Sepolia on Mezo's canonical bridge (Wormhole NTT), delivered by you with no relayer fee.", "/app/bridge", true);
export default function Layout({ children }: { children: React.ReactNode }) { return <>{children}</>; }
