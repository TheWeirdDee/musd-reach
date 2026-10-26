import { pageMetadata } from "@/lib/metadata";
import { AppNav } from "@/components/app/AppKit";
import { CompactFooter } from "@/components/site/CompactFooter";

export const metadata = pageMetadata("Portfolio", "Inspect your Mezo and Base Sepolia savings positions, balances and transfers.", "/app", true);

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <><div className="shell app-shell pb-10 pt-4">
      <AppNav />
      {children}
    </div><CompactFooter /></>
  );
}
