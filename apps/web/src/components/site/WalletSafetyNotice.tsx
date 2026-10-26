import Link from "next/link";

export function WalletSafetyNotice() {
  return (
    <aside className="safety-notice rounded-sm px-3" aria-label="Wallet safety notice">
      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-1 py-2.5 text-xs leading-relaxed">
        <p><strong>Read-only preview.</strong> Wallet actions are paused while a reported MetaMask warning is reviewed.</p>
        <Link href="/security" className="shrink-0 font-medium underline underline-offset-4">Investigation status ↗</Link>
      </div>
    </aside>
  );
}
