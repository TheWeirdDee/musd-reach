import Link from "next/link";
import { metamaskAdvisory } from "@/lib/wallets";

/**
 * Contextual notice on app routes only: it reports the one wallet-specific restriction that is
 * still open (MetaMask's own classification of this domain) without calling the application
 * read-only. Connection and signing for other verified wallets are enabled.
 */
export function WalletSafetyNotice() {
  return (
    <aside className="safety-notice rounded-sm px-3" aria-label="Wallet safety notice">
      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-1 py-2.5 text-xs leading-relaxed">
        <p>
          <strong>MetaMask warning open.</strong> MetaMask classifies this site as unsafe and its review is ongoing.
          Wallets other than MetaMask are unaffected. Do not override a warning your wallet shows.
        </p>
        <Link href={metamaskAdvisory.href} className="shrink-0 font-medium underline underline-offset-4">
          {metamaskAdvisory.linkLabel} ↗
        </Link>
      </div>
    </aside>
  );
}