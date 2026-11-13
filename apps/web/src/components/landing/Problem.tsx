import { Reveal, SectionHead } from "./Reveal";

/** Read on Mezo mainnet, 12 Nov 2026 (analysis/market-data.mjs). */
const stats = [
  { value: "19.0M", label: "MUSD issued", note: "Mezo's Bitcoin-backed dollar, now bridged to Ethereum and Base" },
  { value: "1.33M", label: "MUSD in the Savings Vault", note: "about 7% of supply; it held 7.4M until one large Mezo contract withdrew 5.25M on 5 Nov" },
  { value: "17.7M", label: "MUSD outside the vault", note: "earning nothing from Mezo's savings fees" },
];

const options = [
  {
    name: "Keep sMUSD on Mezo",
    principal: "Stays in the vault",
    yield: "Keeps accruing to you",
    elsewhere: "Nothing usable on Base",
    verdict: "Earns, but idle",
  },
  {
    name: "Withdraw and bridge MUSD",
    principal: "Leaves the vault",
    yield: "Stops",
    elsewhere: "Plain MUSD, no savings rate",
    verdict: "Moves, but stops saving",
  },
  {
    name: "Bridge sMUSD naively",
    principal: "Locked somewhere",
    yield: "Accrues to the custodian, not you",
    elsewhere: "A token with no claim on yield",
    verdict: "Looks portable, leaks yield",
  },
  {
    name: "Reach",
    principal: "Stays in Mezo's vault",
    yield: "Keeps accruing to your shares",
    elsewhere: "rwSMUSD collateral: borrow MUSD or USDC on Morpho",
    verdict: "Earns on Mezo, works on Base",
    reach: true,
  },
];

const flywheel = [
  ["Saving stops being a trade-off", "Savers keep the Mezo savings rate and still get liquidity on Base."],
  ["More MUSD stays in sMUSD", "Every rwSMUSD is backed by MUSD deposited in Mezo's own Savings Vault."],
  ["More fees reach savers and veBTC", "A deeper vault compounds the MUSD fee flow back to Mezo's holders."],
];

export function Problem() {
  return (
    <Reveal as="section" className="surface-light relative py-16 sm:py-20">
      <div className="shell">
        <SectionHead
          light
          index="01"
          kicker="The problem"
          title={
            <>
              Only 7% of MUSD is saved. <span className="font-serif font-normal italic">Saving means sitting still.</span>
            </>
          }
          lede={
            <p>
              MUSD already reaches Ethereum and Base over Wormhole, but the savings position does not. Mezo&apos;s Savings Vault tracks yield per address, so a saver must choose between earning the savings rate on Mezo and putting those dollars to work anywhere else. Most holders choose liquidity.
            </p>
          }
        />
        <dl data-reveal className="mt-12 grid gap-6 sm:grid-cols-3">
          {stats.map((s) => (
            <div key={s.label} className="border-t border-ink-950/15 pt-4">
              <dt className="font-mono text-[0.625rem] uppercase tracking-[0.12em] text-ink-500">{s.label}</dt>
              <dd className="mt-2 text-[2.25rem] font-semibold leading-none tracking-[-0.03em] text-ink-950">{s.value}</dd>
              <dd className="mt-2 text-sm text-ink-600">{s.note}</dd>
            </div>
          ))}
        </dl>
        <div data-reveal tabIndex={0} role="region" aria-label="Comparison of options (scrolls horizontally)" className="mt-14 relative overflow-x-auto rounded-md border border-ink-950/10 bg-white/50">
          <table className="w-full min-w-[46rem] border-collapse text-left text-[0.9375rem]">
            <caption className="sr-only">Ways to use MUSD savings outside Mezo</caption>
            <thead>
              <tr className="border-b border-ink-950/10">
                {["Option", "Principal", "Savings yield", "On Base you get", "Verdict"].map((h) => (
                  <th key={h} scope="col" className="px-5 py-4 font-mono text-[0.625rem] font-normal uppercase tracking-[0.12em] text-ink-500">
                    {h === "Verdict" ? <span className="sr-only">{h}</span> : h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {options.map((o) => (
                <tr key={o.name} className={o.reach ? "bg-ink-950 text-bone-100" : "border-b border-ink-950/10 text-ink-800"}>
                  <th scope="row" className={`px-5 py-5 font-semibold tracking-[-0.01em] ${o.reach ? "text-bone-50" : "text-ink-950"}`}>
                    {o.name}
                  </th>
                  <td className="px-5 py-5">{o.principal}</td>
                  <td className="px-5 py-5">{o.yield}</td>
                  <td className="px-5 py-5">{o.elsewhere}</td>
                  <td className="px-5 py-5 text-right">
                    <span className={`font-serif text-lg italic ${o.reach ? "text-ember-400" : "text-ink-500"}`}>{o.verdict}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div data-reveal className="mt-14">
          <p className="font-mono text-[0.625rem] uppercase tracking-[0.12em] text-ink-500">Why it grows Mezo</p>
          <ol className="mt-4 grid gap-6 sm:grid-cols-3">
            {flywheel.map(([t, d], i) => (
              <li key={t} className="border-t border-ink-950/15 pt-4">
                <span className="num text-sm text-ember-600">0{i + 1}</span>
                <p className="mt-2 font-semibold tracking-[-0.01em] text-ink-950">{t}</p>
                <p className="mt-1 text-sm leading-6 text-ink-600">{d}</p>
              </li>
            ))}
          </ol>
        </div>
        <p data-reveal className="mt-10 max-w-3xl text-xs leading-relaxed text-ink-500">
          Sources: Mezo mainnet, read 12 November 2026: MUSD <span className="num">totalSupply</span> 19.0M and Savings Vault <span className="num">totalSupply</span> 1.33M (7.0%), with the vault&apos;s supply at past blocks for its history; the 5.25M withdrawal is transaction <span className="num">0x700d…6605</span>, from Mezo&apos;s VaultGauge through its Enclave contract. Yield behaviour is read from the deployed <span className="num">MUSDSavingsRate</span> source (<span className="num">claimable = balance × (yieldIndex − userIndex)</span>) and reproduced against the live vault in fork tests.
        </p>
      </div>
    </Reveal>
  );
}
