import { pageMetadata } from "@/lib/metadata";
export const metadata = pageMetadata("Transfer history", "Inspect indexed transfers, filters, timestamps, statuses and recovery tracker links.", "/app/history", true);
export default function Layout({ children }: { children: React.ReactNode }) { return <>{children}</>; }
