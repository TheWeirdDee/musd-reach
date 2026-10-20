import type { Metadata } from "next";
import { ContentPage, H2, Prose, Code } from "@/components/site/Page";
import { Notice } from "@/components/ui/primitives";
import { reachConfig, deployment, explorer } from "@/lib/reach";

export const metadata: Metadata = { title: "Developers" };

const contracts = [
  ["ReachSavingsWrapper", "Mezo", "wSMUSD. ERC-4626 interface over MUSD; claim-and-hold wrapper of native sMUSD. depositSavings, redeemInKind, harvest.", deployment?.wrapper, "mezo"],
  ["ReachSourceGateway", "Mezo", "Custody + messenger. lockAndIssue, depositAndIssue, depositSavingsAndIssue, receiveRedeem, publishNav.", deployment?.sourceGateway, "mezo"],
  ["ReachDestinationGateway", "Base Sepolia", "receiveIssue, burnAndRedeem, receiveNav, latestNav. No admin after one-time bind.", deployment?.destinationGateway, "base"],
  ["RemoteWrapperReceipt", "Base Sepolia", "rwSMUSD. ERC-20 + permit, 18 decimals. Only the destination gateway mints/burns.", deployment?.receipt, "base"],
  ["MUSDSavingsRate (native)", "Mezo", "Mezo's vault. Not ERC-4626: 1:1 principal, account-indexed yield.", reachConfig.mezo.savingsVault, "mezo"],
] as const;

export default function DevelopersPage() {
  return (
    <ContentPage kicker="Developers" title="Integrate, verify, or audit Reach" lede={<p>Everything needed to accept rwSMUSD safely, check its backing independently, or reproduce the proof from a clean checkout.</p>}>
      <div className="space-y-16">
        <section className="space-y-5">
          <H2 id="model">The model in one paragraph</H2>
          <Prose>
            <p>
              <strong>wSMUSD</strong> is a share of the ReachSavingsWrapper, which owns native sMUSD principal on Mezo plus the native yield that principal earns while the wrapper holds it. <strong>rwSMUSD</strong> on Base is a claim on exactly one wSMUSD unit locked in the ReachSourceGateway, minted only after a guardian-signed ISSUE message from that gateway is verified on Base, and burned before a REDEEM message is published. Indicative value: <code>rwSMUSD units × wrapper.convertToAssets(1e18) / 1e18</code> MUSD, read on Mezo at a stated block. It is not native sMUSD and not a dollar.
            </p>
          </Prose>
        </section>

        <section className="space-y-5">
          <H2 id="contracts">Contracts</H2>
          {!deployment && <Notice tone="pending">Reach contracts are not deployed on public testnets yet; addresses appear here from deployments/testnet.json once they are.</Notice>}
          <div className="overflow-x-auto rounded-md border border-ink-700">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <thead className="bg-ink-900">
                <tr>
                  {["Contract", "Chain", "Role", "Address"].map((h) => (
                    <th key={h} className="px-4 py-3 font-mono text-[0.625rem] font-normal uppercase tracking-[0.12em] text-ink-400">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-750">
                {contracts.map(([n, c, r, a, chain]) => (
                  <tr key={n}>
                    <td className="px-4 py-3 font-medium text-bone-100">{n}</td>
                    <td className="px-4 py-3 text-ink-300">{c}</td>
                    <td className="px-4 py-3 text-ink-300">{r}</td>
                    <td className="num px-4 py-3 text-xs">
                      {a ? (
                        <a className="break-hash text-bone-200 underline decoration-ink-600 underline-offset-4 hover:text-ember-400" href={chain === "mezo" ? explorer.mezoAddress(a) : explorer.baseAddress(a)} target="_blank" rel="noreferrer">
                          {a}
                        </a>
                      ) : (
                        <span className="text-sand-300">not deployed</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Prose>
            <p>
              ABIs: <code>packages/sdk/src/abis.ts</code> (generated from Foundry artifacts). Source: <code>packages/contracts/src</code>. Pinned chain facts: <code>packages/protocol-registry/registry.json</code>.
            </p>
          </Prose>
        </section>

        <section className="space-y-5">
          <H2 id="accept">Accepting rwSMUSD as collateral or payment</H2>
          <Prose>
            <p>Before treating rwSMUSD as worth anything, an integration should check, at minimum:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>The token is the receipt deployed by the enrolled destination gateway (<code>receipt.gateway()</code>), and that gateway&apos;s <code>sourceGateway()</code> and <code>wrapper()</code> match the registry.</li>
              <li>The backing equation balances (<code>reconcile()</code> in the SDK).</li>
              <li>A fresh NAV: on Base, <code>ReachDestinationGateway.latestNav()</code> holds the most recent guardian-attested snapshot (assets, supply, Mezo timestamp and block). Anyone can refresh it with <code>publishNav()</code> on Mezo.</li>
              <li>Exit latency: a holder needs Base finality plus guardian signing before shares are released on Mezo. Price that in.</li>
            </ul>
          </Prose>
          <Code label="read-backing.ts">{`import { buildConfig, createReachClients, readWrapperState, reconcile } from "@musd-reach/sdk";
import deployments from "./deployments/testnet.json";

const cfg = buildConfig({ deployments });
const clients = createReachClients(cfg);

const nav = await readWrapperState(clients.mezo, cfg);
// nav.assetsPerShare: MUSD base units per 1e18 wSMUSD, at nav.blockNumber
const backing = await reconcile(clients, cfg);
// backing.status === "BALANCED" when locked == supply + in-flight issues + in-flight redemptions`}</Code>
          <Code label="Solidity: read the attested NAV on Base">{`(uint256 assets, uint256 supply, uint64 ts, uint64 mezoBlock, ) = IReachDestinationGateway(gw).latestNav();
require(block.timestamp - ts <= MAX_AGE, "stale NAV");
uint256 musdPerShare = (assets + 1) * 1e18 / (supply + 1); // same virtual offset as the wrapper`}</Code>
        </section>

        <section className="space-y-5">
          <H2 id="message">Message format</H2>
          <Prose>
            <p>
              Payloads are <code>abi.encode(ReachMessages.Message)</code>: protocol id <code>keccak256(&quot;MUSD_REACH&quot;)</code>, version 1, direction (1 ISSUE, 2 REDEEM, 3 NAV), origin/target EVM chain ids, origin/target Wormhole chain ids, origin/target gateways, wrapper, receipt, nonce, shares, sender, recipient, redeem mode, minimum assets and a NAV snapshot. Transfer id: <code>keccak256(abi.encode(protocolId, version, direction, originEvmChainId, originWormholeChainId, originGateway, nonce))</code>. Both the transfer id and the VAA digest are consumed on delivery.
            </p>
          </Prose>
        </section>

        <section className="space-y-5">
          <H2 id="verify">Verify independently</H2>
          <Prose>
            <p>The verifier reads chains directly, never our API, and exits non-zero on any failed check.</p>
          </Prose>
          <Code label="terminal">{`git clone <repo> && cd musd-reach && pnpm install
pnpm verify registry                 # pinned vault implementation, Wormhole cores, chain ids
pnpm verify deployment               # Reach wiring: peers, receipt minter, wrapper binding
pnpm verify reconcile                # backing equation from chain state
pnpm verify evidence evidence/real-chain/<run>.json   # every receipt + every VAA via live Core
# alternative RPCs:  --mezo-rpc <url> --base-rpc <url>`}</Code>
          <Code label="contracts">{`cd packages/contracts
forge test                               # unit, fuzz, invariant
RUN_FORK=true forge test --match-path "test/fork/ReachLiveFork.t.sol"            # live vault + real cores (fork)
RUN_FORK_BASE_MAINNET=true forge test --match-contract MorphoCompatibilityForkTest  # Morpho (fork)`}</Code>
        </section>
      </div>
    </ContentPage>
  );
}
