import { Reveal, SectionHead } from "./Reveal";
import { WorthItCalculator } from "@/components/app/WorthItCalculator";
import { snapshot, savingsRate, breakEvenSaved } from "@/lib/economics";

const m = (x: number) => (x >= 1e6 ? `${(x / 1e6).toFixed(2)}M` : x >= 1e3 ? `${Math.round(x / 1e3)}k` : x.toFixed(0));
const p = (x: number) => `${(x * 100).toFixed(2)}%`;
const day = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** The economics, from Mezo mainnet and Morpho on Base (analysis/market-data.mjs). */
export function WhyItPays() {
  const s = snapshot;
  if (!s) return null;
  const r7 = savingsRate(s, 7);
  const r30 = savingsRate(s, 30);
  const rb = s.morphoBase.usdcBorrowRate;
  // The last reading before the 5 Nov withdrawal: the latest date still holding over twice today's savings.
  const before = [...s.savings.history].filter((h) => h.saved > s.savings.saved * 2).sort((a, b) => b.date.localeCompare(a.date))[0] ?? s.savings.history[0];
  const stats = [
    { value: `$${m(s.savings.yieldPoolAnnualized30d)}`, label: "a year of MUSD fees paid to savers", note: "Mezo's last 30 days, annualized. One pool, shared by everyone saved." },
    { value: `${m(s.savings.saved)} MUSD`, label: "saved today", note: `Down from ${m(before.saved)} on ${day(before.date)}: one large Mezo contract withdrew 5.25M on 5 Nov.` },
    { value: `${p(r7.rate)} · ${p(r30.rate)}`, label: "paid to savers, last 7 · 30 days", note: `Against ${p(rb)} to borrow USDC on Morpho on Base.` },
    { value: `${m(breakEvenSaved(s, rb))} MUSD`, label: "where the two rates meet", note: "If the fee pool holds, borrowing against savings pays until this much is saved." },
  ];
  return (
    <Reveal as="section" className="relative border-t border-ink-800 bg-ink-950 py-16 sm:py-20">
      <div className="shell">
        <SectionHead
          index="02"
          kicker="Why it pays"
          title={
            <>
              Savers share Mezo&apos;s fees. <span className="font-serif font-normal italic text-ember-400">Today that beats the cost of borrowing.</span>
            </>
          }
          lede={
            <p>
              Mezo pays its Savings Vault from MUSD borrowing fees, split among everyone saved. When savers leave, each one left earns more. Right now the savings rate is above what dollars cost to borrow on Base, so keeping MUSD saved and borrowing against it comes out ahead of withdrawing. As more MUSD is saved, the rate falls back toward borrow rates: the market settles itself. Lenders earn 90% of the interest borrowers pay, on loans backed by MUSD in Mezo&apos;s own vault.
            </p>
          }
        />
        <dl data-reveal className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((x) => (
            <div key={x.label} className="flex flex-col border-t border-ink-700 pt-4">
              <dt className="order-2 mt-2 font-mono text-[0.625rem] uppercase tracking-[0.12em] text-ink-300">{x.label}</dt>
              <dd className="num order-1 text-[1.75rem] font-semibold leading-none tracking-[-0.03em] text-bone-50">{x.value}</dd>
              <dd className="order-3 mt-2 text-sm leading-6 text-ink-400">{x.note}</dd>
            </div>
          ))}
        </dl>
        <div data-reveal className="mt-12">
          <WorthItCalculator />
        </div>
        <p data-reveal className="mt-6 max-w-3xl text-xs leading-relaxed text-ink-400">
          Sources, {day(s.asOf)}: Mezo mainnet (Savings Vault yield index and supply at past blocks, block {s.mezoBlock.toLocaleString("en-US")}) and Morpho&apos;s public API ({s.morphoBase.listedMarkets} listed Base markets). Seven days is a short window and rates move as savers come and go. Re-run with <span className="num">node analysis/market-data.mjs</span>.
        </p>
      </div>
    </Reveal>
  );
}
