import { Reveal, SectionHead } from "./Reveal";
import { deployment, reachConfig, explorer } from "@/lib/reach";
import { shortHex } from "@musd-reach/sdk";

function Node({ name, role, addr, href, tone = "dark", external }: { name: string; role: string; addr?: string | null; href?: string; tone?: "dark" | "ember"; external?: boolean }) {
  return (
    <div className={`rounded-sm border p-4 ${tone === "ember" ? "border-ember-500/50 bg-ember-500/[0.06]" : "border-ink-700 bg-ink-850"}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium tracking-[-0.01em] text-bone-50">{name}</p>
        {external && <span className="kicker shrink-0 text-ink-400">existing</span>}
      </div>
      <p className="mt-1 text-sm leading-snug text-ink-300">{role}</p>
      <p className="num mt-3 text-[0.75rem]">
        {addr ? (
          <a href={href} target="_blank" rel="noreferrer" className="text-bone-200 underline decoration-ink-600 underline-offset-4 hover:text-ember-400">
            {shortHex(addr, 6, 4)}
          </a>
        ) : (
          <span className="text-sand-300">not deployed</span>
        )}
      </p>
    </div>
  );
}

function Link({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-1 pl-4" aria-hidden>
      <span className="h-6 w-px bg-ink-600" />
      <span className="font-mono text-[0.625rem] uppercase tracking-[0.12em] text-ink-400">{label}</span>
    </div>
  );
}

export function Architecture() {
  const d = deployment;
  return (
    <Reveal as="section" className="py-24 sm:py-32">
      <div className="shell">
        <SectionHead
          index="04"
          kicker="Protocol architecture"
          title={
            <>
              Four small contracts, <span className="font-serif font-normal italic text-ember-400">no keys that move money.</span>
            </>
          }
          lede={
            <p>
              Custody and messaging share one contract per chain, so no internal trust edge can release shares. Peer configuration is immutable. The deployer&apos;s only power was a one-time binding; the guardian role can pause <em>new</em> deposits and locks, never exits.
            </p>
          }
        />

        <div className="mt-14 grid gap-8 lg:grid-cols-[1fr_auto_1fr] lg:items-start">
          <div data-reveal className="rounded-md border border-ink-700 bg-ink-900 p-5">
            <div className="mb-4 flex items-center justify-between">
              <p className="kicker text-ink-300">Mezo testnet · {reachConfig.mezo.evmChainId}</p>
              <span className="kicker text-ink-500">Wormhole {reachConfig.mezo.wormholeChainId}</span>
            </div>
            <Node name="MUSDSavingsRate" role="Native vault. 1:1 principal, per-address yield index." addr={reachConfig.mezo.savingsVault} href={explorer.mezoAddress(reachConfig.mezo.savingsVault)} external />
            <Link label="deposit / claimYield / withdraw" />
            <Node name="ReachSavingsWrapper" role="wSMUSD. Owns principal + future yield. Harvests before every price." addr={d?.wrapper} href={d ? explorer.mezoAddress(d.wrapper) : undefined} tone="ember" />
            <Link label="lock exact shares" />
            <Node name="ReachSourceGateway" role="Custody + messenger. Releases only on a verified REDEEM." addr={d?.sourceGateway} href={d ? explorer.mezoAddress(d.sourceGateway) : undefined} tone="ember" />
            <Link label="publishMessage · consistency 202" />
            <Node name="Wormhole Core" role="Guardian network observes and signs." addr={reachConfig.mezo.wormholeCore} href={explorer.mezoAddress(reachConfig.mezo.wormholeCore)} external />
          </div>

          <div data-reveal className="flex items-center justify-center lg:h-full lg:flex-col" aria-hidden>
            <div className="h-px w-full bg-[repeating-linear-gradient(90deg,var(--color-ink-500)_0_6px,transparent_6px_12px)] lg:h-full lg:w-px lg:bg-[repeating-linear-gradient(180deg,var(--color-ink-500)_0_6px,transparent_6px_12px)]" />
            <span className="mx-3 shrink-0 rounded-full border border-ink-600 bg-ink-950 px-3 py-1 font-mono text-[0.625rem] uppercase tracking-[0.12em] text-ember-300 lg:my-3">signed VAA</span>
            <div className="h-px w-full bg-[repeating-linear-gradient(90deg,var(--color-ink-500)_0_6px,transparent_6px_12px)] lg:h-full lg:w-px lg:bg-[repeating-linear-gradient(180deg,var(--color-ink-500)_0_6px,transparent_6px_12px)]" />
          </div>

          <div data-reveal className="rounded-md border border-ink-700 bg-ink-900 p-5">
            <div className="mb-4 flex items-center justify-between">
              <p className="kicker text-ink-300">Base Sepolia · {reachConfig.base.evmChainId}</p>
              <span className="kicker text-ink-500">Wormhole {reachConfig.base.wormholeChainId}</span>
            </div>
            <Node name="Wormhole Core" role="parseAndVerifyVM checks guardian signatures." addr={reachConfig.base.wormholeCore} href={explorer.baseAddress(reachConfig.base.wormholeCore)} external />
            <Link label="verify · emitter · fields · replay" />
            <Node name="ReachDestinationGateway" role="Mints once per transfer id; burns before REDEEM." addr={d?.destinationGateway} href={d ? explorer.baseAddress(d.destinationGateway) : undefined} tone="ember" />
            <Link label="sole minter" />
            <Node name="RemoteWrapperReceipt" role="rwSMUSD. Plain ERC-20 + permit. No owner, no pause." addr={d?.receipt} href={d ? explorer.baseAddress(d.receipt) : undefined} tone="ember" />
            <Link label="any integration" />
            <div className="rounded-sm border border-dashed border-ink-600 p-4 text-sm text-ink-300">Wallets, multisigs, lending markets. See integration status for what is actually verified.</div>
          </div>
        </div>

        <div data-reveal className="mt-10 grid gap-px overflow-hidden rounded-md border border-ink-700 bg-ink-700 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Mezo testnet", `EVM ${reachConfig.mezo.evmChainId} · Wormhole ${reachConfig.mezo.wormholeChainId}`, "Instant finality (CometBFT). Gas paid in testnet BTC."],
            ["Base Sepolia", `EVM ${reachConfig.base.evmChainId} · Wormhole ${reachConfig.base.wormholeChainId}`, "Guardians sign after L2 finality; expect tens of minutes on the return leg."],
            ["Messaging", "Wormhole Core, consistency 202", "Testnet guardian set 0 has a single guardian. Mainnet uses 19 with a 13 quorum."],
            ["Mainnet", "Not deployed", "No mainnet contracts exist. A mainnet launch would need an independent audit first."],
          ].map(([a, b, c]) => (
            <div key={a} className="bg-ink-900 p-5">
              <p className="kicker text-ink-400">{a}</p>
              <p className="num mt-3 text-sm text-bone-100">{b}</p>
              <p className="mt-2 text-sm leading-relaxed text-ink-300">{c}</p>
            </div>
          ))}
        </div>
      </div>
    </Reveal>
  );
}
