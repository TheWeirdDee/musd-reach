import Link from "next/link";

export function WalletSafetyNotice() {
  return (
    <aside className="safety-notice" aria-label="Wallet safety notice">
      <div className="shell flex flex-wrap items-center justify-between gap-x-5 gap-y-1 py-2.5 text-xs leading-relaxed">
        <p><strong>Wallet connections paused.</strong> A reported MetaMask safety warning is under investigation. Public information remains available.</p>
        <Link href="/security" className="shrink-0 font-medium underline underline-offset-4">Investigation status ↗</Link>
      </div>
    </aside>
  );
}
