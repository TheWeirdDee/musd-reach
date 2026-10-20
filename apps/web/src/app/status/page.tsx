"use client";

import { useQuery } from "@tanstack/react-query";
import { formatAmount } from "@musd-reach/sdk";
import { ContentPage, H2 } from "@/components/site/Page";
import { Chip, Hash, Notice, Panel, Row, Skeleton, type Tone } from "@/components/ui/primitives";
import { useApi, useClients, useNativeVault, useReconciliation, useWrapper, apiConfigured } from "@/lib/hooks";
import { reachConfig, deployment, explorer } from "@/lib/reach";
import { useNow } from "@/lib/useIsClient";

function Line({ label, tone, value, hint }: { label: string; tone: Tone; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <Row label={label} hint={hint}>
      <span className="inline-flex flex-wrap items-center justify-end gap-2">
        {value}
        <Chip tone={tone}>{tone === "verified" ? "ok" : tone === "failed" ? "fail" : tone === "pending" ? "attention" : "info"}</Chip>
      </span>
    </Row>
  );
}

export default function StatusPage() {
  const clients = useClients();
  const vault = useNativeVault();
  const wrapper = useWrapper();
  const rec = useReconciliation();
  const health = useApi<{ wormholescan: { ok: boolean }; pending: { status: string; n: number }[] }>("/v1/messaging/health", { refetchInterval: 30_000 });
  const heads = useQuery({
    queryKey: ["heads"],
    enabled: !!clients,
    refetchInterval: 15_000,
    queryFn: async () => {
      const [m, b, bf] = await Promise.all([clients!.mezo.getBlock(), clients!.base.getBlock(), clients!.base.getBlock({ blockTag: "finalized" })]);
      return { m, b, bf };
    },
  });
  const now = useNow(5000);
  const age = (ts?: bigint) => (ts ? `${Math.max(0, now - Number(ts))}s ago` : "—");

  return (
    <ContentPage kicker="Protocol status" title="Live health, read in your browser" lede={<p>Unknown and stale states are shown as such. A failing check here means you should not act on Reach until it clears.</p>}>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel className="p-6">
          <H2>Chains</H2>
          <dl className="mt-4">
            <Line label="Mezo testnet head" tone={heads.data ? (now - Number(heads.data.m.timestamp) < 120 ? "verified" : "pending") : heads.isError ? "failed" : "info"} value={heads.data ? <span className="num text-xs">#{heads.data.m.number.toString()} · {age(heads.data.m.timestamp)}</span> : <Skeleton className="h-4 w-24" />} hint={reachConfig.mezo.rpcUrls[0]} />
            <Line label="Base Sepolia head" tone={heads.data ? (now - Number(heads.data.b.timestamp) < 120 ? "verified" : "pending") : heads.isError ? "failed" : "info"} value={heads.data ? <span className="num text-xs">#{heads.data.b.number.toString()} · {age(heads.data.b.timestamp)}</span> : <Skeleton className="h-4 w-24" />} hint={reachConfig.base.rpcUrls[0]} />
            <Line label="Base finalized lag" tone="info" value={heads.data ? <span className="num text-xs">{(heads.data.b.number - heads.data.bf.number).toString()} blocks</span> : <Skeleton className="h-4 w-16" />} hint="Return messages wait for this" />
          </dl>
        </Panel>
        <Panel className="p-6">
          <H2>Native savings vault</H2>
          <dl className="mt-4">
            <Line label="Implementation" tone={vault.data ? (vault.data.implementationMatchesRegistry ? "verified" : "failed") : vault.isError ? "failed" : "info"} value={vault.data ? <Hash value={vault.data.implementation} href={explorer.mezoAddress(vault.data.implementation)} /> : <Skeleton className="h-4 w-24" />} hint="Must equal the pinned, explorer-verified implementation" />
            <Line label="PCV fee source" tone="info" value={vault.data ? <span className="num text-xs">{vault.data.pcv === "0x0000000000000000000000000000000000000000" ? "not configured" : vault.data.pcv}</span> : <Skeleton className="h-4 w-16" />} hint="Zero on testnet: yield only arrives if someone distributes it" />
            <Line label="Total sMUSD" tone="info" value={vault.data ? <span className="num text-xs">{formatAmount(vault.data.totalSupply, 18, 2)}</span> : <Skeleton className="h-4 w-16" />} />
          </dl>
        </Panel>
        <Panel className="p-6">
          <H2>Reach contracts</H2>
          {!deployment ? (
            <Notice tone="pending" className="mt-4">Not deployed on public testnets yet.</Notice>
          ) : (
            <dl className="mt-4">
              <Line label="Wrapper deposits" tone={wrapper.data ? (wrapper.data.depositsPaused ? "pending" : "verified") : "info"} value={wrapper.data ? (wrapper.data.depositsPaused ? "paused" : "open") : <Skeleton className="h-4 w-12" />} />
              <Line label="Wrapper NAV" tone="info" value={wrapper.data ? <span className="num text-xs">{formatAmount(wrapper.data.assetsPerShare, 18, 8)} MUSD</span> : <Skeleton className="h-4 w-16" />} hint={wrapper.data ? `block ${wrapper.data.blockNumber}` : undefined} />
              <Line label="Backing reconciliation" tone={rec.data ? (rec.data.status === "BALANCED" ? "verified" : "failed") : rec.isError ? "failed" : "info"} value={rec.data ? rec.data.status.toLowerCase() : rec.isError ? "unavailable" : <Skeleton className="h-4 w-16" />} />
            </dl>
          )}
        </Panel>
        <Panel className="p-6">
          <H2>Messaging and indexer</H2>
          {!apiConfigured ? (
            <Notice tone="info" className="mt-4">No indexer API configured for this build. Messaging health is visible per transfer on its tracker.</Notice>
          ) : health.isError ? (
            <Notice tone="pending" className="mt-4">Indexer API unreachable: {(health.error as Error).message}</Notice>
          ) : (
            <dl className="mt-4">
              <Line label="Wormholescan API" tone={health.data ? (health.data.wormholescan.ok ? "verified" : "failed") : "info"} value={health.data ? (health.data.wormholescan.ok ? "reachable" : "unreachable") : <Skeleton className="h-4 w-16" />} />
              <Line label="In-flight transfers" tone="info" value={health.data ? <span className="num text-xs">{health.data.pending.reduce((s, p) => s + p.n, 0)}</span> : <Skeleton className="h-4 w-8" />} />
            </dl>
          )}
        </Panel>
      </div>
    </ContentPage>
  );
}
