"use client";

import Link from "next/link";
import { useState } from "react";
import { isAddress, type Address } from "viem";
import { Amount, Arrow, Chip, EmptyState, Notice, Panel, Row, Skeleton, Hash, ButtonLink } from "@/components/ui/primitives";
import { PageTitle, NotDeployedNotice, ConnectPrompt, useGate } from "@/components/app/AppKit";
import { usePosition, useWrapper } from "@/lib/hooks";
import { useLocalTransfers } from "@/lib/pending";
import { explorer, reachConfig } from "@/lib/reach";

export default function PortfolioPage() {
  const { address, connected, deployed } = useGate();
  const [lookup, setLookup] = useState("");
  const viewed: Address | undefined = isAddress(lookup) ? (lookup as Address) : address;
  const pos = usePosition(viewed);
  const wrapper = useWrapper();
  const local = useLocalTransfers(viewed);
  const p = pos.data;

  return (
    <>
      <PageTitle kicker="Portfolio" title="Your savings exposure">
        Every figure below is read directly from Mezo testnet and Base Sepolia, block-stamped. Native yield that belongs to your own account is shown separately from anything Reach holds.
      </PageTitle>

      <div className="space-y-6">
        {!deployed && <NotDeployedNotice />}

        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-center"
          onSubmit={(e) => e.preventDefault()}
          aria-label="View any address read-only"
        >
          <label htmlFor="lookup" className="text-sm text-ink-300 sm:w-56">
            {connected ? "Viewing your wallet. Inspect another:" : "Browse read-only by address:"}
          </label>
          <input
            id="lookup"
            value={lookup}
            onChange={(e) => setLookup(e.target.value.trim())}
            placeholder="0x…"
            spellCheck={false}
            className="num h-11 min-w-0 flex-1 rounded-sm border border-ink-600 bg-ink-950 px-3 text-sm text-bone-100 outline-none focus:border-ember-500"
          />
          {lookup && !isAddress(lookup) && <span className="text-xs text-rust-300">Not a valid address</span>}
        </form>

        {!viewed ? (
          <ConnectPrompt what="see your balances, or paste any address above to browse read-only" />
        ) : pos.isError ? (
          <Notice tone="failed" title="Couldn't read balances">
            {(pos.error as Error).message.split("\n")[0]}. No cached or estimated figures are shown in their place.
          </Notice>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            <Panel className="p-6">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold tracking-[-0.02em] text-bone-50">On Mezo</h2>
                {p && <span className="num text-xs text-ink-400">block {p.mezoBlock.toString()}</span>}
              </div>
              <dl className="mt-4">
                <Row label="MUSD" hint="Wallet balance">{p ? <Amount value={p.musd} unit="MUSD" /> : <Skeleton className="h-4 w-24" />}</Row>
                <Row label="Native sMUSD principal" hint="Held directly in Mezo's savings vault">{p ? <Amount value={p.nativeSmusd} unit="sMUSD" /> : <Skeleton className="h-4 w-24" />}</Row>
                <Row label="Your native claimable yield" hint="Yours, in your own account. Never part of Reach.">{p ? <Amount value={p.nativeClaimableYield} unit="MUSD" places={6} /> : <Skeleton className="h-4 w-24" />}</Row>
                <Row label="wSMUSD (unlocked)" hint="Reach wrapper shares in your wallet">{!deployed ? <span className="text-ink-400">not deployed</span> : p ? <Amount value={p.wsmusd} unit="wSMUSD" /> : <Skeleton className="h-4 w-24" />}</Row>
                <Row label="wSMUSD value" hint="At current wrapper NAV, rounded down">{!deployed ? <span className="text-ink-400">—</span> : p ? <Amount value={p.wsmusdValueMusd} unit="MUSD" /> : <Skeleton className="h-4 w-24" />}</Row>
                <Row label="Gas" hint="Testnet BTC">{p ? <Amount value={p.mezoGas} unit="BTC" places={6} /> : <Skeleton className="h-4 w-24" />}</Row>
              </dl>
            </Panel>

            <Panel className="p-6">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold tracking-[-0.02em] text-bone-50">On Base Sepolia</h2>
                {p && <span className="num text-xs text-ink-400">block {p.baseBlock.toString()}</span>}
              </div>
              <dl className="mt-4">
                <Row label="rwSMUSD" hint="Remote receipts. Each unit claims one locked wSMUSD unit">{!deployed ? <span className="text-ink-400">not deployed</span> : p ? <Amount value={p.rwsmusd} unit="rwSMUSD" /> : <Skeleton className="h-4 w-24" />}</Row>
                <Row label="Indicative value" hint="Receipts × Mezo wrapper NAV. Not a price on Base, not a peg">{!deployed ? <span className="text-ink-400">—</span> : p ? <Amount value={p.rwsmusdIndicativeValueMusd} unit="MUSD" /> : <Skeleton className="h-4 w-24" />}</Row>
                <Row label="Gas" hint="Sepolia ETH">{p ? <Amount value={p.baseGas} unit="ETH" places={6} /> : <Skeleton className="h-4 w-24" />}</Row>
              </dl>
              <p className="mt-4 text-xs leading-relaxed text-ink-400">
                rwSMUSD and the wSMUSD locked behind it are the same claim. They are never added together.
              </p>
            </Panel>
          </div>
        )}

        {deployed && wrapper.data && (
          <Panel className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold tracking-[-0.02em] text-bone-50">Wrapper</h2>
              <Chip tone={wrapper.data.depositsPaused ? "pending" : "verified"}>{wrapper.data.depositsPaused ? "Deposits paused · exits open" : "Open"}</Chip>
            </div>
            <dl className="mt-4 grid gap-x-10 md:grid-cols-2">
              <Row label="Net assets">
                <Amount value={wrapper.data.totalAssets} unit="MUSD" />
              </Row>
              <Row label="Shares outstanding">
                <Amount value={wrapper.data.totalSupply} unit="wSMUSD" />
              </Row>
              <Row label="NAV per share">
                <Amount value={wrapper.data.assetsPerShare} places={8} unit="MUSD" />
              </Row>
              <Row label="Unclaimed native yield" hint="Counted in NAV; harvested before every price">
                <Amount value={wrapper.data.pendingYield} places={8} unit="MUSD" />
              </Row>
            </dl>
            <p className="mt-3 text-xs text-ink-400">
              Testnet yield is whatever the vault actually distributes; it may be zero. Address:{" "}
              <Hash value={reachConfig.deployment!.wrapper} href={explorer.mezoAddress(reachConfig.deployment!.wrapper)} />
            </p>
          </Panel>
        )}

        <Panel className="p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-[-0.02em] text-bone-50">Transfers started in this browser</h2>
            <Link href="/app/history" className="inline-flex items-center gap-1.5 text-sm text-ink-300 hover:text-bone-100">
              Full history <Arrow />
            </Link>
          </div>
          <div className="mt-4">
            {local.length === 0 ? (
              <EmptyState title="No transfers yet" action={deployed ? <ButtonLink href="/app/wrap" intent="secondary">Wrap savings <Arrow /></ButtonLink> : undefined}>
                Transfers you start appear here immediately and survive refreshes. Each links to a tracker that reads both chains directly.
              </EmptyState>
            ) : (
              <ul className="divide-y divide-ink-750">
                {local.map((t) => (
                  <li key={t.transferId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="flex items-center gap-3">
                      <Chip tone="info">{t.direction === "ISSUE" ? "Mezo → Base" : "Base → Mezo"}</Chip>
                      <Amount value={BigInt(t.shares)} unit={t.direction === "ISSUE" ? "wSMUSD" : "rwSMUSD"} />
                    </div>
                    <Link href={`/app/transfers/${t.transferId}?tx=${t.originTx}&dir=${t.direction}&seq=${t.sequence}`} className="inline-flex items-center gap-1.5 text-sm text-bone-100 underline decoration-ink-600 underline-offset-4 hover:text-ember-400">
                      Track <Arrow />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>
      </div>
    </>
  );
}
