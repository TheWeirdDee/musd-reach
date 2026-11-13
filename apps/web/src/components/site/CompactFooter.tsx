import Link from "next/link";
import { LiveRoute } from "./LiveRoute";

/** Footer for app and content pages: the live route and the links people need while using the app. */
export function CompactFooter() {
  return (
    <footer data-compact-footer className="mt-10 border-t border-ink-700 bg-ink-950">
      <div className="shell space-y-5 py-6">
        <LiveRoute compact />
        <div className="flex flex-col gap-3 border-t border-ink-800 pt-4 text-xs text-ink-400 sm:flex-row sm:items-center sm:justify-between">
          <nav aria-label="Resources" className="flex flex-wrap gap-x-5 gap-y-2 pointer-coarse:gap-y-0">
            <Link className="hover:text-bone-100" href="/start">Try it</Link>
            <Link className="hover:text-bone-100" href="/passport">Route passport</Link>
            <Link className="hover:text-bone-100" href="/attack">Attack the bridge</Link>
            <Link className="hover:text-bone-100" href="/docs">Docs</Link>
            <Link className="hover:text-bone-100" href="/contracts">Contracts</Link>
            <Link className="hover:text-bone-100" href="/risks">Risks</Link>
            <Link className="hover:text-bone-100" href="/status">Status</Link>
          </nav>
          <p className="num">Testnet only · Mezo 31611 · Base Sepolia 84532</p>
        </div>
      </div>
    </footer>
  );
}
