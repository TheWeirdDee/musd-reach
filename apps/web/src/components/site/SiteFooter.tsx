import Link from "next/link";
import { Logo } from "./SiteHeader";
import { REPO_URL } from "@/lib/links";

const cols = [
  {
    title: "Product",
    links: [
      { href: "/app", label: "Portfolio" },
      { href: "/app/wrap", label: "Wrap savings" },
      { href: "/app/portable/new", label: "Make portable" },
      { href: "/app/redeem", label: "Redeem" },
      { href: "/app/history", label: "History" },
    ],
  },
  {
    title: "Verify",
    links: [
      { href: "/proof", label: "Proof explorer" },
      { href: "/status", label: "Protocol status" },
      { href: "/integrations", label: "Integration status" },
      { href: "/risks", label: "Risks & disclosures" },
    ],
  },
  {
    title: "Build",
    links: [
      { href: "/developers", label: "Developers" },
      { href: "/developers#contracts", label: "Contracts" },
      { href: "/developers#verify", label: "Verifier CLI" },
      { href: REPO_URL, label: "Source code" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer data-marketing-footer className="border-t border-ink-700 bg-ink-950">
      <div className="shell grid gap-12 py-14 md:grid-cols-[1.3fr_repeat(3,1fr)]">
        <div className="max-w-sm space-y-4">
          <Logo />
          <p className="text-sm leading-relaxed text-ink-300">
            Experimental software on public testnets. Not audited by an independent firm. Testnet assets have no value. Nothing here is an offer of yield, a dollar peg, or borrowing.
          </p>
        </div>
        {cols.map((c) => (
          <div key={c.title}>
            <p className="kicker mb-4 text-ink-400">{c.title}</p>
            <ul className="space-y-2.5">
              {c.links.map((l) => (
                <li key={l.href}>
                  {l.href.startsWith("http") ? (
                    <a href={l.href} target="_blank" rel="noreferrer" className="text-sm text-ink-200 transition-colors hover:text-bone-100">
                      {l.label}
                    </a>
                  ) : (
                    <Link href={l.href} className="text-sm text-ink-200 transition-colors hover:text-bone-100">
                      {l.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="shell flex flex-col gap-2 border-t border-ink-800 py-6 text-xs text-ink-400 sm:flex-row sm:justify-between">
        <p>Built for the Mezo hackathon.</p>
        <p className="num">Mezo testnet 31611 · Base Sepolia 84532</p>
      </div>
    </footer>
  );
}
