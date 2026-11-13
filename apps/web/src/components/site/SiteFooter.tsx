import Link from "next/link";
import { Logo } from "./SiteHeader";
import { LiveRoute } from "./LiveRoute";
import { ButtonLink, Arrow } from "@/components/ui/primitives";
import { REPO_URL } from "@/lib/links";

const cols = [
  {
    title: "Use it",
    links: [
      { href: "/start", label: "Try it on testnet" },
      { href: "/app/portable/new", label: "Move savings to Base" },
      { href: "/app/borrow", label: "Borrow" },
      { href: "/app/lend", label: "Lend" },
      { href: "/app/bridge", label: "Bridge MUSD" },
      { href: "/app/redeem", label: "Bring savings home" },
    ],
  },
  {
    title: "Check it",
    links: [
      { href: "/attack", label: "Attack the bridge" },
      { href: "/proof", label: "Proof explorer" },
      { href: "/status", label: "Live status" },
      { href: "/contracts", label: "Contracts" },
      { href: "/risks", label: "Risks & disclosures" },
    ],
  },
  {
    title: "Build on it",
    links: [
      { href: "/developers", label: "Developers" },
      { href: "/docs", label: "Docs" },
      { href: "/integrations", label: "Integrations" },
      { href: "/docs/economics", label: "Business model" },
    ],
  },
  {
    title: "Community",
    links: [
      { href: "/passport", label: "Route passport" },
      { href: REPO_URL, label: "Source code" },
      { href: `${REPO_URL}/issues/new`, label: "Report an issue" },
      { href: "https://mezo.org", label: "Mezo" },
    ],
  },
];

const linkClass = "text-sm text-ink-200 transition-colors hover:text-ember-400";

export function SiteFooter() {
  return (
    <footer data-marketing-footer className="relative overflow-hidden border-t border-ink-700 bg-ink-950">
      <div className="shell pt-14 sm:pt-16">
        {/* The route, live */}
        <div className="grid items-end gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <div>
            <p className="kicker text-ember-400">The route, live</p>
            <p className="mt-3 text-[clamp(1.75rem,1.2rem+2vw,2.75rem)] font-semibold leading-[1.05] tracking-[-0.03em] text-bone-50">
              Earn on Mezo. <span className="font-serif font-normal italic text-ember-400">Borrow on Base.</span>
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <ButtonLink href="/start">
                Get your free route kit <Arrow />
              </ButtonLink>
              <ButtonLink href="/app" intent="secondary">
                Open the app
              </ButtonLink>
            </div>
          </div>
          <LiveRoute />
        </div>

        {/* Links */}
        <div className="mt-14 grid grid-cols-2 gap-x-6 gap-y-10 border-t border-ink-800 pt-10 lg:grid-cols-[1.2fr_repeat(4,1fr)]">
          <div className="col-span-2 max-w-xs space-y-4 lg:col-span-1">
            <Logo />
            <p className="text-sm leading-relaxed text-ink-300">Mezo savings, portable to Base. Your MUSD keeps earning in Mezo&apos;s own vault while a receipt for it works on Base.</p>
          </div>
          {cols.map((c) => (
            <nav key={c.title} aria-label={c.title}>
              <p className="kicker mb-4 text-ink-400">{c.title}</p>
              <ul className="space-y-2.5">
                {c.links.map((l) => (
                  <li key={l.href}>
                    {l.href.startsWith("http") ? (
                      <a href={l.href} target="_blank" rel="noreferrer" className={linkClass}>
                        {l.label} <span aria-hidden className="text-ink-500">↗</span>
                      </a>
                    ) : (
                      <Link href={l.href} className={linkClass}>
                        {l.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </div>

      {/* Wordmark */}
      <div aria-hidden className="pointer-events-none mt-10 select-none overflow-hidden">
        <p className="shell translate-y-[18%] bg-gradient-to-b from-ink-700 to-ink-950 bg-clip-text text-[clamp(5rem,22vw,20rem)] font-black leading-[0.8] tracking-[-0.06em] text-transparent">
          Reach<span className="font-serif font-normal italic">.</span>
        </p>
      </div>

      {/* Legal */}
      <div className="relative border-t border-ink-800 bg-ink-950">
        <div className="shell flex flex-col gap-2 py-5 text-xs text-ink-400 md:flex-row md:items-center md:justify-between">
          <p>Testnet software, not independently audited. Test tokens have no value; nothing here is an offer of yield or credit.</p>
          <p className="num shrink-0">Mezo testnet 31611 · Base Sepolia 84532 · Built on Mezo</p>
        </div>
      </div>
    </footer>
  );
}
