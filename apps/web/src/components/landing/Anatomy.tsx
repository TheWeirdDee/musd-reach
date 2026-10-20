import { Reveal, SectionHead } from "./Reveal";

const tokens = [
  {
    sym: "sMUSD",
    origin: "Mezo, native",
    who: "Mezo's savings vault",
    is: "MUSD principal, minted and burned 1:1",
    yield: "Paid per address via a yield index; stays with whoever held it when it accrued",
    moves: "Transferable, but accrued yield does not travel with it",
    exit: "withdraw() returns principal + claims your yield",
  },
  {
    sym: "wSMUSD",
    origin: "Mezo, Reach wrapper",
    who: "ReachSavingsWrapper (no admin mint, no fee)",
    is: "A pro-rata share of the wrapper's net assets: sMUSD principal + claimed yield + pending yield",
    yield: "Accrues to the wrapper and lifts every share's value equally; supply never inflates to pay it",
    moves: "Standard ERC-20 on Mezo",
    exit: "Redeem to MUSD at NAV, or in kind (sMUSD + MUSD) even if the vault can't pay out",
  },
  {
    sym: "rwSMUSD",
    origin: "Base Sepolia, Reach receipt",
    who: "RemoteWrapperReceipt (only its gateway can mint/burn)",
    is: "A claim on exactly one locked wSMUSD unit per unit",
    yield: "None directly. The value of the locked share it claims can rise as wrapper yield accrues, or fall on loss",
    moves: "Standard ERC-20 + permit on Base",
    exit: "Burn → authenticated message → release on Mezo",
  },
];

export function Anatomy() {
  return (
    <Reveal as="section" className="surface-light py-24 sm:py-32">
      <div className="shell">
        <SectionHead
          light
          index="03"
          kicker="Native savings vs. portable receipt"
          title={
            <>
              Three tokens, <span className="font-serif font-normal italic">three different promises.</span>
            </>
          }
          lede={
            <p>
              rwSMUSD is not MUSD, not native sMUSD, and not pegged to a dollar. Its indicative value is <span className="num text-ink-950">units × wrapper assets per share</span>, read from Mezo at a stated block, and it carries cross-chain risk on top of the savings vault&apos;s own.
            </p>
          }
        />
        <div className="mt-14 grid gap-px overflow-hidden rounded-md border border-ink-950/10 bg-ink-950/10 lg:grid-cols-3">
          {tokens.map((t, i) => (
            <article key={t.sym} data-reveal className={i === 2 ? "bg-ink-950 p-7 text-bone-100" : "bg-bone-50 p-7 text-ink-900"}>
              <p className={`kicker ${i === 2 ? "text-ink-300" : "text-ink-500"}`}>{t.origin}</p>
              <h3 className={`mt-4 text-[2.5rem] font-semibold leading-none tracking-[-0.04em] ${i === 2 ? "text-bone-50" : "text-ink-950"}`}>{t.sym}</h3>
              <p className={`mt-2 text-sm ${i === 2 ? "text-ink-300" : "text-ink-500"}`}>{t.who}</p>
              <dl className="mt-7 space-y-5 text-[0.9375rem] leading-relaxed">
                {[
                  ["Represents", t.is],
                  ["Yield", t.yield],
                  ["Transfers", t.moves],
                  ["Exit", t.exit],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className={`font-mono text-[0.625rem] uppercase tracking-[0.12em] ${i === 2 ? "text-ember-400" : "text-ember-600"}`}>{k}</dt>
                    <dd className="mt-1">{v}</dd>
                  </div>
                ))}
              </dl>
            </article>
          ))}
        </div>
        <p data-reveal className="mt-6 max-w-3xl text-sm leading-relaxed text-ink-600">
          Wrapping existing sMUSD: yield you accrued before the transfer stays claimable in your own Mezo account. The wrapper only earns on that principal from the moment it owns it. Testnet yield is whatever the testnet vault actually distributes, which may be nothing.
        </p>
      </div>
    </Reveal>
  );
}
