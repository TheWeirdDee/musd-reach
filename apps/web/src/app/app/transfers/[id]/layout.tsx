import { pageMetadata } from "@/lib/metadata";
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return pageMetadata("Transfer tracker", "Read the source receipt, guardian message, target consumption and pending settlement status.", `/app/transfers/${id}`, true);
}
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
