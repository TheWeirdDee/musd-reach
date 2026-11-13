import Link from "next/link";
import { Reveal, SectionHead } from "./Reveal";
import { MezoSavedStat } from "./MezoSavedStat";
import { reachConfig } from "@/lib/reach";
import { registry } from "@musd-reach/sdk";

const mezoExplorer = reachConfig.mezo.explorer;
const baseExplorer = reachConfig.base.explorer;
const ntt = registry.canonicalMusdNtt;

const pieces = [
  {
    name: "MUSD",
    role: "The asset",
    body: "Savers deposit MUSD and can exit in MUSD. The MUSD market on Base lends Mezo's own stablecoin.",
    href: `${mezoExplorer}/address/${reachConfig.mezo.musd}`,
  },
  {
    name: "MUSD Savings Vault",
    role: "The yield",
    body: "Every rwSMUSD is MUSD held in Mezo's MUSDSavingsRate vault, earning the savings rate the whole time it works on Base.",
    href: `${mezoExplorer}/address/${reachConfig.mezo.savingsVault}`,
  },
  {
    name: "MUSD PCV",
    role: "The fees",
    body: "Each deposit and exit first distributes protocol fees into the vault, so no newcomer buys yield owed to existing savers.",
    href: "/docs/mezo",
  },
  {
    name: "Mezo Wormhole Core",
    role: "The messages",
    body: "ISSUE and NAV messages leave Mezo only from finalized blocks; REDEEM messages are verified on Mezo before savings are released.",
    href: `${mezoExplorer}/address/${reachConfig.mezo.wormholeCore}`,
  },
  {
    name: "Mezo's MUSD bridge",
    role: "The way home",
    body: "Borrowed MUSD goes back to Mezo on Mezo's own Wormhole NTT bridge and can be saved again, closing the loop.",
    href: `${mezoExplorer}/address/${ntt.mezoManager}`,
  },
  {
    name: "MUSD on Base",
    role: "The loan",
    body: "Canonical MUSD minted by Mezo's bridge is the loan asset of the rwSMUSD/MUSD market and the Reach MUSD Vault.",
    href: `${baseExplorer}/address/${ntt.baseMusd}`,
  },
];

export function BuiltOnMezo() {
  return (
    <Reveal as="section" className="relative py-16 sm:py-20">
      <span id="mezo" className="absolute -top-16" aria-hidden />
      <div className="shell">
        <SectionHead
          index="04"
          kicker="Built on Mezo"
          title={
            <>
              Mezo&apos;s asset, Mezo&apos;s yield, <span className="font-serif font-normal italic text-ember-400">Mezo&apos;s bridge.</span>
            </>
          }
          lede={
            <p>
              Reach does not wrap a generic stablecoin. Every rwSMUSD is MUSD sitting in Mezo&apos;s own Savings Vault, the loan can be MUSD itself, and the trip home runs on Mezo&apos;s own bridge. The wrapper is also tested on a local fork of Mezo <em>mainnet</em>, against the live mainnet Savings Vault, ready for launch after audit.
            </p>
          }
        />
        <ul data-reveal className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pieces.map((p) => (
            <li key={p.name}>
              <a href={p.href} target={p.href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="block h-full rounded-md border border-ink-700 bg-ink-850 p-5 transition-colors hover:border-ember-500/60">
                <p className="kicker text-ember-400">{p.role}</p>
                <p className="mt-2 font-semibold tracking-[-0.01em] text-bone-50">{p.name}</p>
                <p className="mt-2 text-sm leading-6 text-ink-300">{p.body}</p>
              </a>
            </li>
          ))}
        </ul>
        <MezoSavedStat />
        <p data-reveal className="mt-8 text-sm text-ink-300">
          Every function Reach calls on each Mezo contract, with testnet and mainnet addresses:{" "}
          <Link href="/docs/mezo" className="text-bone-100 underline underline-offset-4">Built on Mezo</Link>.
        </p>
      </div>
    </Reveal>
  );
}
