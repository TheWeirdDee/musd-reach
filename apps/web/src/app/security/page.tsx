import Link from "next/link";
import { ContentPage, H2, Prose } from "@/components/site/Page";
import { CompactFooter } from "@/components/site/CompactFooter";
import { Chip, Notice, Panel } from "@/components/ui/primitives";
import { pageMetadata } from "@/lib/metadata";
import { repoFile } from "@/lib/links";
import { walletConnectEnabled, WALLETS } from "@/lib/wallets";

export const metadata = pageMetadata(
  "Wallet safety investigation",
  "A reported MetaMask warning remains under investigation. Other verified wallets connect normally; the MetaMask notice is shown where it applies.",
  "/security",
);

export default function SecurityStatus() {
  const offered = WALLETS.filter((w) => w.key !== "walletconnect" || walletConnectEnabled)
    .map((w) => w.name)
    .join(", ");
  return (
    <>
      <ContentPage
        kicker="Security / Open investigation"
        title="Wallet access and security"
        lede={
          <p>
            A malicious-site warning was reported when connecting MetaMask to musd-reach.vercel.app. We have not
            declared it a false positive and we have not confirmed it cleared.
          </p>
        }
      >
        <div className="space-y-8">
          <Notice tone="pending" title="MetaMask still reports a warning; other wallets connect normally">
            The report names one wallet provider&apos;s classification of this domain. It is not a finding against the
            application, so it does not pause wallets that do not flag the site: the chooser offers {offered}, and
            transactions sign again. MetaMask stays in the list with its availability stated honestly, and its notice
            appears in the chooser next to the row. Do not bypass a warning your wallet shows, and do not disable its
            protection.
          </Notice>

          <div className="grid gap-5 md:grid-cols-2">
            <Panel className="p-6">
              <Chip tone="pending">Unresolved</Chip>
              <H2>Classification review</H2>
              <Prose>
                <p>
                  The report concerns connection, not a reported transaction. The wallet version, provider-specific
                  report and original alert screenshot are still needed to reproduce the exact classification.
                </p>
                <p>
                  A negative check against a public domain list cannot rule out another provider&apos;s finding. An
                  internal source review cannot clear a wallet warning, and nothing on this page certifies the
                  application as safe.
                </p>
              </Prose>
            </Panel>

            <Panel className="p-6">
              <H2>What the application requests</H2>
              <Prose>
                <p>
                  Normal connection requests the chosen account address. The transaction UI uses exact approvals and
                  explicit gateway calls. No permit or typed-data signature flow is implemented, and every write is
                  simulated against chain state before it is offered for signing.
                </p>
                <p>
                  Public chain reads, documentation, contract addresses and proof never need a wallet, so they stay
                  available whichever warning a wallet shows.
                </p>
              </Prose>
            </Panel>
          </div>

          <section className="space-y-4">
            <H2>Checked before wallet access was restored</H2>
            <Prose>
              <p>
                The blanket hold was lifted only after the application itself was re-examined. The checks, their
                results and their limits are recorded in the findings register (F-33); in short: the served bundle
                matches this repository&apos;s source at the deployed revision, every write target comes from the
                recorded deployment, approvals are exact-amount and never unlimited, the request surface is unchanged
                (no <code>eth_sign</code> or permit), and the per-request Content-Security-Policy is intact. None of
                them found a defect that would justify pausing every wallet.
              </p>
              <p>
                What was not established: why MetaMask classifies the domain, whether that classification changes, and
                whether it clears. Those remain open.
              </p>
            </Prose>
          </section>

          <section className="space-y-4">
            <H2>What happens next</H2>
            <ol className="list-decimal space-y-3 pl-5 text-sm leading-7 text-ink-200">
              <li>Supply the original alert, wallet version and report reference to the provider&apos;s review.</li>
              <li>
                Repeat a full connect, switch, sign and confirm cycle with a normal, security-enabled MetaMask
                installation against the live site.
              </li>
              <li>Record the provider&apos;s decision here. Until then the notice stays in the chooser.</li>
            </ol>
          </section>

          <section className="space-y-4">
            <H2>Read the evidence yourself</H2>
            <div className="flex flex-wrap gap-4 text-sm underline underline-offset-4">
              <Link href="/contracts">Current v2 contracts</Link>
              <Link href="/proof">Public-chain evidence</Link>
              <Link href="/docs/risks">Trust assumptions</Link>
              <a href={repoFile("docs/SECURITY_FINDINGS.md")} target="_blank" rel="noreferrer">
                Findings register ↗
              </a>
              <a href="https://support.metamask.io/configure/wallet/security-alerts/" target="_blank" rel="noreferrer">
                Official MetaMask reporting guidance ↗
              </a>
            </div>
          </section>

          <p className="text-xs leading-6 text-ink-400">
            The classification is still open. This page does not certify the application as safe, and passing
            verifier checks are not a professional audit. The MetaMask notice inside the wallet chooser links to
            this page.
          </p>
        </div>
      </ContentPage>
      <CompactFooter />
    </>
  );
}