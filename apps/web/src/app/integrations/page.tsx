import type { Metadata } from "next";
import Link from "next/link";
import { integrations } from "@musd-reach/sdk";
import { ContentPage, H2, Prose } from "@/components/site/Page";
import { Chip, Notice } from "@/components/ui/primitives";
import { statusLabel, statusTone } from "@/lib/status";
import { repoFile } from "@/lib/links";

export const metadata: Metadata = { title: "Integrations" };

export default function IntegrationsPage() {
  return (
    <ContentPage
      kicker="Integrations"
      title="What actually accepts rwSMUSD today"
      lede={<p>Statuses only move when there is evidence. Permissionless compatibility is not adoption, and a team-run harness is not a partner.</p>}
    >
      <div className="space-y-6">
        <section className="grid gap-5 lg:grid-cols-2"><div className="rounded-md border border-ink-700 bg-ink-900 p-6"><H2>A transferable savings claim</H2><p className="mt-4 text-sm leading-7 text-ink-200">One rwSMUSD unit represents one wSMUSD unit locked on Mezo. An application may hold or transfer the ERC-20 receipt on Base Sepolia, then burn it to request a return. The savings principal stays in the native Mezo vault.</p><Link href="/docs/tokens" className="mt-4 inline-block text-sm text-ember-300 underline underline-offset-4">Understand the four tokens →</Link></div><div className="rounded-md border border-ink-700 bg-ink-900 p-6"><H2>Compatibility needs a policy</H2><p className="mt-4 text-sm leading-7 text-ink-200">NAV is an indicative asset value, not a market price or a peg. Check the exact token, gateway wiring, backing and observation freshness. Budget for an asynchronous redemption; do not assume instant Base liquidity.</p><Link href="/developers" className="mt-4 inline-block text-sm text-ember-300 underline underline-offset-4">Developer integration portal →</Link></div></section>
        <Notice tone="pending" title="Borrowing is not available">
          No lending market accepting rwSMUSD exists on any public network. We will not show a borrow action until a funded market, a reviewed oracle and a demonstrated liquidation path exist.
        </Notice>
        <ul className="space-y-4">
          {integrations.map((i) => (
            <li key={i.id} className="rounded-md border border-ink-700 bg-ink-900 p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold tracking-[-0.02em] text-bone-50">{i.name}</h2>
                  <p className="mt-1 text-sm text-ink-400">{i.network}</p>
                </div>
                <Chip tone={statusTone[i.status] ?? "neutral"}>{statusLabel[i.status] ?? i.status}</Chip>
              </div>
              <p className="mt-4 max-w-3xl leading-relaxed text-ink-200">{i.detail}</p>
              {"blockers" in i && i.blockers && (
                <div className="mt-5">
                  <p className="kicker text-ink-400">Blockers before any live market</p>
                  <ul className="mt-3 space-y-2">
                    {i.blockers.map((b) => (
                      <li key={b} className="flex gap-3 text-sm leading-relaxed text-ink-300">
                        <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-sand-400" aria-hidden />
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {i.evidence.length > 0 && (
                <p className="mt-5 text-xs text-ink-400">
                  Evidence:{" "}
                  {i.evidence.map((e) => (
                    <a key={e} href={repoFile(e)} target="_blank" rel="noreferrer" className="num break-hash mr-2 rounded-xs bg-ink-850 px-1.5 py-0.5 text-bone-200 underline decoration-ink-500 underline-offset-2 hover:text-bone-100">
                      {e}
                    </a>
                  ))}
                </p>
              )}
            </li>
          ))}
        </ul>
        <section className="space-y-5 pt-5"><H2>Capability and adoption matrix</H2><div role="region" aria-label="Capability and adoption matrix" tabIndex={0} className="overflow-x-auto rounded-md border border-ink-700"><table className="w-full min-w-[38rem] text-left text-sm"><thead><tr>{["Capability", "Evidence level", "What that means"].map((h) => <th className="border-b border-ink-700 p-4 font-medium" scope="col" key={h}>{h}</th>)}</tr></thead><tbody className="divide-y divide-ink-700">{[["Receipt hold, transfer and redemption", "Public-testnet verified", "Recorded v2 lifecycle; inspect each transaction in Proof."], ["Morpho Blue market path", "Fork-tested", "Acceptance, borrow and liquidation on a local Base mainnet fork only."], ["Ordinary ERC-20 interfaces", "Technically compatible", "18-decimal transfers and permit at contract level; no blanket application endorsement."], ["Independent receiving application", "Not integrated", "No independent application has been demonstrated to accept the receipt."], ["Public borrowing market", "Blocked", "No funded market, reviewed oracle, curator or public liquidation setup."], ["Additional remote chains", "Proposed / out of scope", "No deployment or public evidence beyond Base Sepolia."]].map(([capability, status, detail]) => <tr key={capability}><th scope="row" className="p-4 font-medium">{capability}</th><td className="p-4 text-sand-300">{status}</td><td className="p-4 leading-7 text-ink-200">{detail}</td></tr>)}</tbody></table></div></section>
        <section className="space-y-5 pt-5"><H2>Before an application accepts rwSMUSD</H2><Prose><ol className="list-decimal space-y-3 pl-5"><li>Pin the current v2 receipt and verify receipt.gateway, sourceGateway, peer chains and wrapper.</li><li>Reconcile custody against receipt supply, in-flight messages and pending MUSD settlements.</li><li>Enforce a NAV freshness and decimal-scaling policy; stop on missing or stale oracle data.</li><li>Price redemption delay, native-vault impairment, guardian trust and available liquidity.</li><li>Ensure the recipient can initiate pending-settlement recovery. Contracts unable to do so face the F-04 limitation.</li><li>Exercise failures and liquidation on a labelled test environment before making any public availability claim.</li></ol></Prose><div className="flex flex-wrap gap-5 text-sm underline underline-offset-4"><Link href="/docs/integration-example">Integration walkthrough</Link><Link href="/docs/nav">NAV and oracle policy</Link><Link href="/docs/recovery">Recovery model</Link><Link href="/docs/risks">Trust assumptions</Link></div></section>
      </div>
    </ContentPage>
  );
}
