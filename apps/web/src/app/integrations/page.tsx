import type { Metadata } from "next";
import { integrations } from "@musd-reach/sdk";
import { ContentPage } from "@/components/site/Page";
import { Chip, Notice } from "@/components/ui/primitives";
import { statusLabel, statusTone } from "@/lib/status";

export const metadata: Metadata = { title: "Integrations" };

export default function IntegrationsPage() {
  return (
    <ContentPage
      kicker="Integrations"
      title="What actually accepts rwSMUSD today"
      lede={<p>Statuses only move when there is evidence. Permissionless compatibility is not adoption, and a team-run harness is not a partner.</p>}
    >
      <div className="space-y-6">
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
                  Evidence: {i.evidence.map((e) => <code key={e} className="num break-hash mr-2 rounded-xs bg-ink-850 px-1.5 py-0.5 text-bone-200">{e}</code>)}
                </p>
              )}
            </li>
          ))}
        </ul>
      </div>
    </ContentPage>
  );
}
