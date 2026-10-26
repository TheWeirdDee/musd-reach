import { notFound } from "next/navigation";
import { publicRuns, rehearsals } from "@/lib/reach";
import { pageMetadata } from "@/lib/metadata";
export async function generateMetadata({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const run = [...publicRuns, ...rehearsals].find((r) => r.runId === runId);
  if (!run) return { title: "Run not found", robots: { index: false } };
  return pageMetadata(`${run.settlementModel === "pending-v2" ? "v2" : "Historical v1"} lifecycle evidence`, `Inspect ${run.runId}: transactions, messages and recorded lifecycle steps.`, `/proof/${runId}`);
}
export default async function Layout({ children, params }: { children: React.ReactNode; params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  if (![...publicRuns, ...rehearsals].some((r) => r.runId === runId)) notFound();
  return children;
}
