import type { Metadata } from "next";
import { DocsNav } from "@/components/docs/DocsNav";
import { CompactFooter } from "@/components/site/CompactFooter";
export const metadata: Metadata = { title: "Documentation", description: "Learn the Reach token model, first transfers, recovery, SDK, contracts and operations.", alternates: { canonical: "/docs" } };
export default function DocsLayout({ children }: { children: React.ReactNode }) { return <><div className="shell docs-shell"><DocsNav /><div className="min-w-0">{children}</div></div><CompactFooter /></>; }
