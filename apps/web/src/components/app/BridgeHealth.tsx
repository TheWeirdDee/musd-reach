"use client";

import Link from "next/link";
import { Chip, Hash, Notice, Panel, Row } from "@/components/ui/primitives";
import { H2 } from "@/components/site/Page";
import { useMezoSigning, ago } from "@/lib/wormholeHealth";
import { explorer } from "@/lib/reach";

/**
 * Shown on the Mezo → Base flows only while Wormhole's testnet guardian has left a Mezo message
 * unsigned for more than 45 minutes, so testers know before they start.
 */
export function MezoSigningNotice({ className }: { className?: string }) {
  const q = useMezoSigning();
  if (!q.data || q.data.state !== "delayed") return null;
  const d = q.data;
  return (
    <Notice className={className} tone="pending" title="Wormhole testnet is not signing Mezo messages right now">
      {d.waiting.toString()} message{d.waiting === 1n ? "" : "s"} from Mezo {d.waiting === 1n ? "is" : "are"} waiting for Wormhole&apos;s testnet guardian
      {d.oldestWaitingAt ? `, the oldest sent ${ago(d.oldestWaitingAt)}` : ", the oldest for over 10 hours"}
      {d.lastSignedAt ? `; its last Mezo signature was ${ago(d.lastSignedAt)}` : ""}. This is Wormhole&apos;s testnet service, not Reach or Mezo. Anything you send from Mezo now stays safe on chain and completes from its tracker once signing resumes; Base → Mezo steps are not affected. <Link href="/status#wormhole" className="underline underline-offset-4">Live status</Link>
    </Notice>
  );
}

/** Status page panel: per-emitter published vs signed sequences, read live. */
export function MezoSigningPanel() {
  const q = useMezoSigning();
  const d = q.data;
  const tone = !d ? "pending" : d.state === "signing" ? "verified" : d.state === "waiting" ? "pending" : "failed";
  const label = q.isError ? "UNKNOWN · read failed" : !d ? "Checking" : d.state === "signing" ? "Signing, nothing waiting" : d.state === "waiting" ? "Signing in progress" : "Delayed";
  return (
    <Panel className="p-6">
      <div id="wormhole" className="flex flex-wrap items-center justify-between gap-3">
        <H2>Wormhole signing from Mezo</H2>
        <Chip tone={tone}>{label}</Chip>
      </div>
      <p className="mt-4 text-xs leading-6 text-ink-300">
        Each Mezo → Base step needs Wormhole&apos;s testnet guardian to sign the message. This compares the sequence numbers Mezo&apos;s Wormhole Core has handed out with the latest signed message on Wormholescan.
      </p>
      <dl className="mt-3">
        {d?.emitters.map((e) => (
          <Row key={e.emitter} label={e.label} hint={<Hash value={e.emitter} href={explorer.mezoAddress(e.emitter)} />}>
            <span className="num text-xs">
              {e.signed.toString()} of {e.published.toString()} signed{e.lastSignedAt ? ` · last ${ago(e.lastSignedAt)}` : ""}
            </span>
          </Row>
        )) ?? <Row label="Emitters">{q.isError ? "Unknown" : "Reading…"}</Row>}
        {d && d.waiting > 0n && <Row label="Oldest waiting">{d.oldestWaitingAt ? ago(d.oldestWaitingAt) : "over 10 hours"}</Row>}
      </dl>
      <p className="mt-4 text-xs text-ink-400">Read from Mezo testnet and api.testnet.wormholescan.io every minute.</p>
    </Panel>
  );
}
