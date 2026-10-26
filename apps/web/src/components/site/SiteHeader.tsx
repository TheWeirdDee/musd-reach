"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { WalletButton } from "./WalletButton";
import { cn } from "@/lib/cn";
import { deployment } from "@/lib/reach";

const nav = [
  { href: "/app", label: "App" },
  { href: "/proof", label: "Proof" },
  { href: "/integrations", label: "Integrations" },
  { href: "/developers", label: "Developers" },
  { href: "/docs", label: "Docs" },
  { href: "/status", label: "Status" },
];

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("group inline-flex items-center gap-2.5", className)} aria-label="MUSD Reach home">
      <svg viewBox="0 0 28 28" className="h-7 w-7" aria-hidden>
        <rect x="1" y="1" width="26" height="26" rx="6" className="fill-ink-850 stroke-ink-600" strokeWidth="1" />
        <path d="M7 19V9l7 6 7-6v10" fill="none" className="stroke-bone-100" strokeWidth="1.8" strokeLinejoin="round" />
        <circle cx="21" cy="9" r="2.2" className="fill-ember-500 transition-transform duration-500 group-hover:translate-x-px" />
      </svg>
      <span className="text-[0.9375rem] font-semibold tracking-[-0.02em] text-bone-100">
        MUSD <span className="font-serif text-[1.0625rem] font-normal italic tracking-normal text-bone-200">Reach</span>
      </span>
    </Link>
  );
}

export function SiteHeader() {
  const path = usePathname();
  // The menu is open only for the path it was opened on, so navigating closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === path;
  const setOpen = (fn: (o: boolean) => boolean) => setOpenOn(fn(open) ? path : null);
  const scrolled = useSyncExternalStore(
    (cb) => {
      window.addEventListener("scroll", cb, { passive: true });
      return () => window.removeEventListener("scroll", cb);
    },
    () => window.scrollY > 8,
    () => false,
  );
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header className={cn("sticky top-0 z-40 border-b transition-colors duration-300", open ? "border-ink-700 bg-ink-950" : scrolled ? "border-ink-700 bg-ink-950/90 backdrop-blur-md" : "border-transparent bg-transparent")}>
      <div className="shell flex h-16 items-center justify-between gap-3">
        <div className="flex items-center gap-6">
          <Logo />
          <span className="hidden rounded-full border border-ink-600 px-2 py-0.5 font-mono text-[0.625rem] uppercase tracking-[0.12em] text-ink-300 sm:inline">
            {deployment ? "Testnet" : "Testnet · not deployed"}
          </span>
        </div>
        <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={path?.startsWith(n.href) ? "page" : undefined}
              className={cn("rounded-sm px-3 py-2 text-sm transition-colors", path?.startsWith(n.href) ? "text-bone-100" : "text-ink-300 hover:text-bone-100")}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <div className="hidden sm:block">
            <WalletButton />
          </div>
          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded-sm border border-ink-600 text-bone-100 lg:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((o) => !o)}
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
              {open ? <path d="M4 4l12 12M16 4 4 16" /> : <path d="M3 6h14M3 10h14M3 14h14" />}
            </svg>
          </button>
        </div>
      </div>
      {open && (
        <div id="mobile-nav" className="fixed inset-x-0 bottom-0 top-16 z-40 overflow-y-auto border-t border-ink-700 bg-ink-950 lg:hidden">
          <nav aria-label="Mobile" className="shell flex flex-col py-4">
            {[{ href: "/", label: "Overview" }, ...nav, { href: "/risks", label: "Risks" }].map((n) => (
              <Link key={n.href} href={n.href} className="flex min-h-12 items-center justify-between border-b border-ink-800 text-lg tracking-[-0.02em] text-bone-100">
                {n.label}
                <span className="text-ink-400" aria-hidden>
                  →
                </span>
              </Link>
            ))}
            <div className="mt-6 sm:hidden">
              <WalletButton />
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
