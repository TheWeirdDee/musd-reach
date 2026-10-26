"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { PageTitle } from "./AppKit";
import { WalletButton } from "@/components/site/WalletButton";
import { walletSafetyHold } from "@/lib/walletSafety";
import { Chip } from "@/components/ui/primitives";

export function TransactionWorkspace({ children }: { children: ReactNode }) {
  return <div className="transaction-workspace">{children}</div>;
}

export function FlowIntro({ title, description, requirements, steps, docs }: { title: string; description: string; requirements: string[]; steps: string[]; docs: string }) {
  return <>
    <PageTitle kicker="Before you begin" title={title}>{description}</PageTitle>
    <section className="flow-intro">
      <div className="flow-intro-main">
        <Chip tone="neutral">Mezo testnet ↔ Base Sepolia</Chip>
        <h2 className="mt-6 text-2xl font-semibold tracking-tight">Understand the route.<br /><span className="font-serif italic text-ember-400">Then bring your wallet.</span></h2>
        <p className="mt-4 max-w-lg text-sm leading-7 text-ink-200">Your balances and a transaction review appear only after a wallet is connected. Browsing does not request a signature or move funds.</p>
        <ul className="mt-6 space-y-3 text-sm text-ink-200">{requirements.map((r) => <li key={r} className="flex gap-3"><span className="text-ember-400" aria-hidden>↗</span>{r}</li>)}</ul>
        <div className="mt-8 flex flex-wrap items-center gap-4"><WalletButton /><Link className="text-sm underline underline-offset-4" href={docs}>Read the walkthrough →</Link></div>
        {walletSafetyHold && <p className="mt-4 max-w-lg text-xs leading-6 text-sand-300">Connections are paused during the reported MetaMask safety review. Do not bypass a wallet warning. You can continue exploring the documentation and proof.</p>}
      </div>
      <div className="flow-intro-route"><p className="kicker mb-6 text-ink-300">What happens</p><ol className="space-y-0">{steps.map((step, i) => <li key={step} className="flex gap-4 border-t border-ink-700 py-5"><span className="num text-sm text-ember-400">0{i + 1}</span><p className="text-sm leading-6 text-ink-200">{step}</p></li>)}</ol><Link href="/docs/recovery" className="mt-5 inline-block text-xs text-ink-300 underline underline-offset-4">How delays and recovery work ↗</Link></div>
    </section>
  </>;
}
