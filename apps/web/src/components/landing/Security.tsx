import Link from "next/link";
import { Reveal, SectionHead } from "./Reveal";
import { Arrow } from "@/components/ui/primitives";

const trusted = [
  ["Wormhole guardians", "Sign every message. On testnet the guardian set has one key; a compromised guardian set could forge messages in both directions."],
  ["Mezo's savings vault", "Its owner can change the vault's strategy, which holds all principal. Reach inherits that risk and pins the implementation it was verified against."],
  ["Chain finality", "Reach messages wait for finalized blocks (consistency 202). A deep reorg past finality is out of scope."],
  ["The Solidity compiler and OpenZeppelin 5.1", "Standard, widely used dependencies; not independently re-audited here."],
];

const untrusted = [
  ["Relayers", "Anyone can deliver a signed message, including you from this app. A relayer cannot alter, forge or replay one."],
  ["Our backend and indexer", "History and status only. Balances, quotes and backing are read from chain; the API has no keys to contracts."],
  ["The deployer", "Had one power: binding the Base gateway to the Mezo gateway, once. It cannot mint, release, pause exits or upgrade."],
  ["The guardian role", "Can pause new deposits and new locks. It cannot touch custody, block redemptions or change peers."],
];

const tested = [
  "Unit, fuzz and stateful invariant tests: 8,192+ random cross-chain interleavings per run, zero conservation violations",
  "Forged signatures, altered payloads, foreign emitters, wrong chains, wrong destinations and replays rejected",
  "First-depositor inflation, donation and harvest-timing attacks against the real vault logic",
  "Full lifecycle on forks of the live Mezo vault and real Wormhole Core contracts",
  "Slither static analysis: every result triaged, including two High-rated reentrancy flags on nonReentrant paths",
];

export function Security() {
  return (
    <Reveal as="section" className="surface-light py-24 sm:py-32">
      <div className="shell">
        <SectionHead
          light
          index="06"
          kicker="Security and risk model"
          title={
            <>
              What you trust, <span className="font-serif font-normal italic">and what you don&apos;t.</span>
            </>
          }
          lede={
            <p>
              Reach is testnet software that has not had an independent audit. Automated tests and static analysis reduce risk; they do not replace a professional review. Here is the honest boundary.
            </p>
          }
        />
        <div className="mt-14 grid gap-10 lg:grid-cols-2">
          <div data-reveal>
            <p className="kicker mb-5 text-ember-600">You must trust</p>
            <dl className="divide-y divide-ink-950/10 border-y border-ink-950/10">
              {trusted.map(([k, v]) => (
                <div key={k} className="grid gap-1 py-5 sm:grid-cols-[13rem_1fr] sm:gap-6">
                  <dt className="font-semibold tracking-[-0.01em] text-ink-950">{k}</dt>
                  <dd className="leading-relaxed text-ink-700">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div data-reveal>
            <p className="kicker mb-5 text-ink-500">You don&apos;t have to trust</p>
            <dl className="divide-y divide-ink-950/10 border-y border-ink-950/10">
              {untrusted.map(([k, v]) => (
                <div key={k} className="grid gap-1 py-5 sm:grid-cols-[13rem_1fr] sm:gap-6">
                  <dt className="font-semibold tracking-[-0.01em] text-ink-950">{k}</dt>
                  <dd className="leading-relaxed text-ink-700">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
        <div data-reveal className="mt-12 rounded-md bg-ink-950 p-7 text-bone-100 sm:p-9">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="max-w-2xl">
              <p className="kicker text-ink-300">What has been tested</p>
              <ul className="mt-5 space-y-3">
                {tested.map((t) => (
                  <li key={t} className="flex gap-3 text-[0.9375rem] leading-relaxed text-ink-200">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sage-400" aria-hidden />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <Link href="/risks" className="inline-flex shrink-0 items-center gap-2 border-b border-ink-500 pb-0.5 text-[0.9375rem] hover:border-ember-500">
              Full risk disclosures <Arrow />
            </Link>
          </div>
        </div>
      </div>
    </Reveal>
  );
}
