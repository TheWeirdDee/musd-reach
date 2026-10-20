import type { Metadata } from "next";
import { AppNav } from "@/components/app/AppKit";

export const metadata: Metadata = { title: "App" };

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell pb-24 pt-4">
      <AppNav />
      {children}
    </div>
  );
}
