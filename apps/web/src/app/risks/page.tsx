import type { Metadata } from "next";
import { ContentPage, H2, Prose } from "@/components/site/Page";
import { Notice } from "@/components/ui/primitives";
import { settlementCopy } from "@/lib/settlement";
import { knownIssues } from "@/lib/reach";

export const metadata: Metadata = { title: "Risks" };

const risks = [
  ["Not audited", "No independent security firm has reviewed Reach. Tests and static analysis are not an audit. Do not use with value you cannot lose."],
  ["Testnet only", "All contracts run on Mezo testnet and Base Sepolia. Testnet assets have no value. Nothing here is mainnet-ready."],
  ["Bridge trust", "Messages are authenticated by Wormhole guardians. On testnet the guardian set has one key. A compromised guardian set could mint unbacked rwSMUSD or release locked shares."],
  ["Native vault risk", "Principal sits in Mezo's MUSDSavingsRate, whose owner can change the strategy holding all principal. If the vault is impaired, wSMUSD and therefore rwSMUSD lose value, socialised pro rata."],
  ["No peg, no promised yield", "rwSMUSD is a claim on wrapper shares. Its value follows the wrapper's net assets; testnet yield may be zero indefinitely."],
  ["Exit latency", "A return trip needs Base finality, guardian signing, and a delivery transaction on Mezo: typically tens of minutes, possibly longer."],
  ["MUSD redemption liquidity", settlementCopy.risk],
  ["No cancellation", "A locked transfer can't be refunded on timeout, because the receipt could still be minted later. It completes whenever its signed message is delivered."],
  ["Wrong recipient", "Receipts or shares sent to an address you don't control cannot be recovered by anyone, including us."],
  ["Prior yield", "Wrapping existing sMUSD leaves your already-accrued yield claimable in your own Mezo account; it is not added to your wrapper shares."],
  ["Guardian role", "A guardian address can pause new deposits and new locks. It cannot block exits, move funds, or change peers."],
  ["Lending", "Morpho compatibility was tested on a fork only. A stale NAV would freeze both borrows and liquidations in such a market. Borrowing is not offered."],
];

export default function RisksPage() {
  return (
    <ContentPage kicker="Risks and disclosures" title="Read this before you sign anything" lede={<p>Reach is experimental. These are the risks we know about; there may be others.</p>}>
      <div className="space-y-10">
        <Notice tone="pending" title="Experimental testnet software">
          Use at your own risk. No warranty, no insurance, no recovery service.
        </Notice>
        {knownIssues.length > 0 && (
          <Notice tone="failed" title="Known issues in the current deployment">
            <ul className="list-disc space-y-1 pl-5">
              {knownIssues.map((k) => (
                <li key={k}>{k}</li>
              ))}
            </ul>
          </Notice>
        )}
        <dl className="divide-y divide-ink-750 border-y border-ink-750">
          {risks.map(([k, v]) => (
            <div key={k} className="grid gap-2 py-6 md:grid-cols-[16rem_1fr] md:gap-10">
              <dt className="font-semibold tracking-[-0.01em] text-bone-50">{k}</dt>
              <dd className="max-w-3xl leading-relaxed text-ink-200">{v}</dd>
            </div>
          ))}
        </dl>
        <section className="space-y-4">
          <H2>Status vocabulary</H2>
          <Prose>
            <p>
              <strong>Implemented</strong> means code exists. <strong>Tested locally</strong> means unit, fuzz, invariant or fork tests pass. <strong>Verified on public testnet</strong> means a recorded run with real transactions. <strong>Externally adopted</strong> means an independent party uses it. <strong>Production-ready</strong> requires an audit and mainnet deployment. Reach currently claims only the first two for its own contracts.
            </p>
          </Prose>
        </section>
      </div>
    </ContentPage>
  );
}
