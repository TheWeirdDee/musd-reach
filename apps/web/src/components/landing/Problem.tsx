import { Reveal, SectionHead } from "./Reveal";

const options = [
  {
    name: "Keep sMUSD on Mezo",
    principal: "Stays in the vault",
    yield: "Keeps accruing to you",
    elsewhere: "Unusable on Base",
    verdict: "Earns, but stuck",
  },
  {
    name: "Withdraw and bridge MUSD",
    principal: "Leaves the vault",
    yield: "Stops",
    elsewhere: "Plain MUSD on Base",
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
    principal: "Stays in the vault, owned by the wrapper",
    yield: "Accrues to wrapper shares you hold a claim on",
    elsewhere: "rwSMUSD: a 1:1 claim on locked wrapper shares",
    verdict: "Moves the claim, keeps the savings",
    reach: true,
  },
];

export function Problem() {
  return (
    <Reveal as="section" className="surface-light relative py-24 sm:py-32">
      <div className="shell">
        <SectionHead
          light
          index="01"
          kicker="The problem"
          title={
            <>
              Savings that can&apos;t <span className="font-serif font-normal italic">leave the building.</span>
            </>
          }
          lede={
            <p>
              Mezo&apos;s savings vault pays MUSD yield to whoever holds sMUSD <em>at the moment it accrues</em>, tracked per address. That is fair inside Mezo, and it is exactly why savings can&apos;t simply be carried elsewhere: move the token and the yield stays behind with whoever held it.
            </p>
          }
        />
        <div data-reveal tabIndex={0} role="region" aria-label="Comparison of options (scrolls horizontally)" className="mt-14 relative overflow-x-auto rounded-md border border-ink-950/10 bg-white/50">
          <table className="w-full min-w-[46rem] border-collapse text-left text-[0.9375rem]">
            <caption className="sr-only">Ways to use MUSD savings outside Mezo</caption>
            <thead>
              <tr className="border-b border-ink-950/10">
                {["Option", "Principal", "Savings yield", "On Base you hold", "Verdict"].map((h) => (
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
        <p data-reveal className="mt-6 max-w-3xl text-sm leading-relaxed text-ink-600">
          The yield behaviour above is read from the deployed <span className="num">MUSDSavingsRate</span> source (account-indexed: <span className="num">claimable = balance × (yieldIndex − userIndex)</span>) and was reproduced against the live testnet vault in fork tests. Whether a Base borrower actually prefers Reach over withdrawing and bridging is an open question we have not validated with users.
        </p>
      </div>
    </Reveal>
  );
}
