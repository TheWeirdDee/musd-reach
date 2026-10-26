import Link from "next/link";
export function CompactFooter() {
  return <footer data-compact-footer className="shell compact-footer"><span>Experimental testnets · No independent audit</span><nav aria-label="Resources"><Link href="/docs">Documentation</Link><Link href="/contracts">Contracts</Link><Link href="/risks">Risks</Link><Link href="/security">Security status</Link></nav></footer>;
}
