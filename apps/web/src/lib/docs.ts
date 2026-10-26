export type DocSection = { id: string; title: string; body: string[]; points?: string[]; code?: string };
export type DocArticle = { slug: string; group: string; title: string; description: string; source: string; sections: DocSection[] };
const section = (id: string, title: string, ...body: string[]): DocSection => ({ id, title, body });
const article = (slug: string, group: string, title: string, description: string, source: string, sections: DocSection[]): DocArticle => ({ slug, group, title, description, source, sections });

export const articles: DocArticle[] = [
  article("getting-started", "Getting started", "Meet MUSD Reach", "A savings position on Mezo. A transferable claim on Base.", "README.md", [
    section("purpose", "What Reach does", "Reach keeps MUSD in Mezo's native savings vault and lets its holder carry a claim on that position to Base Sepolia. The underlying savings are held on Mezo; the remote token is a receipt, not bridged principal.", "This is experimental testnet software, without an independent professional audit. Testnet assets have no value. Reach does not promise an APY, a dollar peg or a borrowing market."),
    section("route", "Your first route", "Start with MUSD or existing sMUSD on Mezo. Wrap it into wSMUSD, then lock those shares to issue rwSMUSD on Base. To return, burn rwSMUSD and deliver the authenticated return message to Mezo.", "You may inspect public proof, contract addresses and status without a wallet. MetaMask reports a warning for this site and its review is open; do not bypass it. Other verified wallets connect normally."),
    section("before", "Before committing funds", "Read the token model, trust assumptions and recovery guide. Confirm the v2 addresses and the correct testnet chain IDs. Never use the archived v1 deployment for new actions."),
  ]),
  article("how-it-works", "Getting started", "How the claim moves", "Follow the principal, shares and authenticated messages.", "README.md", [
    section("wrap", "1 · Wrap the savings", "ReachSavingsWrapper owns native sMUSD principal and turns principal plus its claimed and pending yield into wSMUSD shares. Claimed yield is held as MUSD and is not reinvested."),
    section("issue", "2 · Lock and issue", "ReachSourceGateway holds your wSMUSD and publishes an ISSUE message. After Wormhole signing, anyone may deliver the VAA on Base. ReachDestinationGateway verifies its fields, emitter and signatures and mints exactly the locked share amount once."),
    section("return", "3 · Burn and return", "The holder burns rwSMUSD on Base and chooses a Mezo recipient and payout mode. After Base finality and guardian signing, anyone may deliver the REDEEM message. Shares are released, or MUSD is paid if the requested minimum can be met. Failed MUSD settlements remain pending for the recipient."),
  ]),
  article("networks", "Getting started", "Supported networks", "Only Mezo testnet and Base Sepolia are supported.", "packages/protocol-registry/registry.json", [
    section("mezo", "Mezo testnet", "EVM chain ID: 31611. Wormhole chain ID: 50. Native gas is paid in testnet BTC. MUSD, sMUSD, the wrapper and source custody live here. Public RPC: https://rpc.test.mezo.org."),
    section("base", "Base Sepolia", "EVM chain ID: 84532. Wormhole chain ID: 10004. Gas is paid in Sepolia ETH. The destination gateway and rwSMUSD live here. A public endpoint is https://base-sepolia-rpc.publicnode.com."),
    section("registry", "Verify the contracts", "Use the Contracts page and deployments/testnet.json as the address registry. A token name alone is not an identity. There is no mainnet deployment and no additional remote chain."),
  ]),
  article("testnet-assets", "Getting started", "Getting testnet assets", "Know which token and gas balance the route requires.", "docs/DEPLOYMENT.md", [
    section("source", "On Mezo", "Wrapping needs MUSD or existing sMUSD and testnet BTC for gas. Locking existing shares needs wSMUSD. Reach does not operate a faucet, provide a loan, or offer an in-app asset purchase. Use Mezo's official testnet resources and verify their URLs independently."),
    section("destination", "On Base Sepolia", "Burning rwSMUSD requires Sepolia ETH for gas. Only a verified ISSUE message mints receipts. An unrelated token labelled MUSD on Base is not a deposit into Reach."),
    section("bridge", "Starting with MUSD elsewhere", "Getting canonical MUSD from Base into Reach requires a separate bridge to Mezo first. The canonical bridge is a different system with its own fees and risks; Reach does not automate it."),
  ]),
  article("wallets", "Getting started", "Wallet connection and safety", "Connection shares an address; it must never request a token approval.", "docs/SECURITY_FINDINGS.md", [
    section("hold", "MetaMask warning", "MetaMask reports a malicious-site warning for this site. The provider's classification is unresolved and is not claimed to be cleared. The wallet chooser keeps MetaMask listed with that notice and links to the investigation, while other verified wallets connect and sign normally. Do not disable your wallet's security checks or proceed past a warning."),
    section("requests", "Expected requests", "A normal connection requests permission to see the selected account. Network switching is separate. Each financial action then needs its own explicit transaction review. Reach's UI does not use permit signatures or ask for a recovery phrase, private key or unrelated signature."),
    section("session", "Account and network changes", "A connected address and its active network must be visible. Changing accounts refreshes account-specific balances and history. Disconnection clears the active session; cached browser data does not prove an account is currently authorized."),
  ]),
  article("first-wrap", "Getting started", "Your first wrap", "Exchange MUSD or native savings principal for wrapper shares.", "packages/contracts/src/mezo/ReachSavingsWrapper.sol", [
    section("review", "Prepare and review", "Open Wrap with MUSD or sMUSD on Mezo. Enter an amount within the live balance and review expected shares, minimum shares, the target contract and gas. A share represents a slice of wrapper assets, not one guaranteed dollar."),
    section("approval", "Two explicit steps", "The UI requests approval for the exact entered token amount to one spender, then deposits. Keeping shares on Mezo uses the wrapper. Making them portable immediately uses the source gateway. The minimum-share bound reverts a deposit below your selected terms."),
    section("result", "Confirm the result", "A normal deposit gives wSMUSD on Mezo. A combined deposit and issue locks the new shares and opens a tracker; it does not immediately produce a Base receipt. Native sMUSD yield earned before wrapping stays claimable by its previous holder."),
  ]),
  article("first-transfer", "Getting started", "Your first cross-chain claim", "Move a claim to Base without withdrawing the savings principal.", "packages/contracts/src/mezo/ReachSourceGateway.sol", [
    section("recipient", "Choose the recipient carefully", "Enter wSMUSD shares and a valid Base Sepolia recipient. The same address string on another chain does not guarantee that a contract can use the receipt. Wrong-address deliveries cannot be recovered by the Reach operator."),
    section("lock", "Approve and lock", "Approve the exact share amount to ReachSourceGateway, then lock and publish ISSUE. Your wSMUSD is in custody. The rwSMUSD amount will equal the locked share amount, not the MUSD NAV value."),
    section("track", "Wait for verification", "Keep the tracker URL. It identifies the origin transaction and transfer ID, waits for a guardian signature and checks target consumption. A relayer may deliver it, or you may do so yourself with Base gas after the message is signed. There is no timeout refund of a locked ISSUE."),
  ]),
  article("first-redemption", "Getting started", "Your first redemption", "Burn on Base, settle on Mezo, and understand the delay.", "packages/contracts/src/base/ReachDestinationGateway.sol", [
    section("mode", "Choose a payout", "Redeem to wSMUSD to receive wrapper shares, or request MUSD with a minimum amount. MUSD is priced at delivery on Mezo, not at the time of the burn. A current NAV is an estimate, not a guaranteed future payout."),
    section("burn", "Burn and wait", "The burn transaction happens on Base Sepolia. The return message waits for Base finality and guardian signing before it can release anything on Mezo. Keep enough gas on the relevant network if you intend to deliver it yourself."),
    section("settle", "Delivery is not always settlement", "In v2, a consumed return message may still have a pending MUSD payout. Retry preserves the original minimum. Only the recipient can accept a new minimum or take shares instead. A successful pending-settlement read is required before the tracker labels the payout settled."),
  ]),
  article("tokens", "Concepts", "Four tokens, four distinct roles", "MUSD, sMUSD, wSMUSD and rwSMUSD are not interchangeable.", "docs/ECONOMIC_MODEL.md", [
    section("native", "MUSD and sMUSD", "MUSD is Mezo's stablecoin. Native sMUSD represents savings principal, redeemable 1:1 for MUSD by the native vault under its assumptions. Its yield is tracked per address and claimed separately; it is not an ordinary accumulating ERC-4626 share."),
    section("wrapper", "wSMUSD", "The Reach wrapper owns native savings principal and its yield. wSMUSD is an ERC-4626 share of that wrapper. Its asset value comes from principal plus accounted idle MUSD and pending yield. Losses or impairment can affect holders."),
    section("receipt", "rwSMUSD", "One rwSMUSD base unit claims one wSMUSD base unit locked on Mezo. It is an ERC-20 on Base Sepolia with 18 decimals. The receipt and its backing are the same exposure and must not be added as separate portfolio assets."),
  ]),
  article("yield-accounting", "Concepts", "Yield accounting", "Harvest before pricing; hold claimed yield rather than reinvest it.", "docs/ECONOMIC_MODEL.md", [
    section("assets", "What is counted", "Wrapper assets are internally accounted principal plus idle MUSD plus native pending yield. Direct token donations do not move the accounted share price. There is no admin mint and no Reach fee."),
    section("harvest", "Why harvest comes first", "Deposits and normal exits harvest native yield before calculating shares. This prevents a newcomer from taking yield belonging to existing holders. Claimed yield stays as MUSD, rather than being redeposited."),
    section("limits", "No promised return", "Testnet yield is whatever the native vault actually distributes and may be zero. Read current NAV and pending yield from chain at a stated block. Positive-yield accounting is also tested locally and on forks; no APY history or fabricated yield chart is displayed."),
  ]),
  article("nav", "Concepts", "NAV and indicative value", "Read a share value at a stated block, not a market price.", "docs/ECONOMIC_MODEL.md", [
    section("meaning", "Net asset value", "The wrapper's convertToAssets converts a share amount to accounted MUSD assets with contract-defined rounding. For a human-readable share, convertToAssets(10^18) gives the MUSD base units per 18-decimal share."),
    section("remote", "Remote value", "An rwSMUSD indicative value uses its claim on wSMUSD and the Mezo wrapper NAV. It is not an exchange quote, a dollar peg or a guarantee that liquidity exists on Base."),
    section("freshness", "Check freshness", "A Base-side NAV snapshot is guardian-attested at a Mezo timestamp and block. Integrations must enforce freshness and correct decimal scaling. A stale or missing oracle observation must not authorize new borrowing."),
  ]),
  article("backing", "Concepts", "Backing and conservation", "Account for receipts and both directions of in-flight messages.", "docs/ECONOMIC_MODEL.md", [
    section("equation", "The conservation equation", "Locked wSMUSD equals rwSMUSD supply plus in-flight issues plus in-flight redemptions. Custody must also cover shares held for pending MUSD settlements. Receipt supply alone is not a complete reconciliation."),
    section("snapshot", "Observe both chains", "The SDK reads Base first, then Mezo, with event records and transferConsumed checks for the in-flight sets. Reads are labelled with their chain blocks. Temporary RPC disagreement is an observation to investigate, not a reason to manufacture a balanced result."),
    section("verify", "Verify independently", "The verifier CLI uses chain data without trusting the Reach API. Live backing, bytecode matching and recorded receipts check different properties. They do not constitute a professional audit or prove guardian independence."),
  ]),
  article("messaging", "Concepts", "Wormhole messages", "Guardian signatures authorize specific actions, not arbitrary relayer choices.", "docs/THREAT_MODEL.md", [
    section("vaa", "What a VAA is", "A VAA is a Wormhole guardian-signed observation of a published message. Reach binds protocol, direction, emitter, source and destination identities, amount, recipient and nonce. An ISSUE message cannot be used as a REDEEM."),
    section("delivery", "Permissionless delivery", "Anyone may submit an authenticated message. The gateway verifies it and consumes the transfer ID so a replay cannot pay twice. A relayer cannot choose a different recipient, amount or payout mode."),
    section("trust", "Guardian trust", "Testnet uses one guardian key. A compromised guardian can undermine message authenticity and backing. Permissionless delivery removes reliance on the Reach relayer, not on guardians or chain finality."),
  ]),
  article("finality", "Concepts", "Finality and cross-chain delays", "A mined transaction and a finalized return message are different milestones.", "docs/PROTOCOL_VERIFICATION.md", [
    section("mezo", "Mezo observations", "Mezo uses CometBFT finality. The Reach indexer treats its latest head as finalized. The pinned Wormhole consistency level is 202, matching the recorded configuration."),
    section("base", "Base return messages", "A Base burn may be included before the chain's finalized head reaches its block. Guardian signing and delivery follow the required finality. This can take tens of minutes; the interface does not promise a completion deadline."),
    section("reorgs", "Indexer recovery", "Unfinalized event blocks are compared with canonical hashes. Orphaned events are removed, the cursor rewinds, and transfer state is derived again. The database is a history cache; balances and consumption come from the chains."),
  ]),
  article("recovery", "Concepts", "Pending settlement and recovery", "A verified return can wait for MUSD without changing your payout terms.", "README.md", [
    section("pending", "Recognize a pending settlement", "If the native vault cannot pay a requested MUSD minimum, v2 stores the recipient, shares and minimum in pendingSettlements. A consumed message is not enough to prove a completed MUSD payout. The tracker reads that record before confirming settlement."),
    section("actions", "Your recovery choices", "Anyone may call retrySettlement with the original terms. Only the recipient may call settleWithMinAssets with a new minimum, or claimSharesInstead to take the earmarked wSMUSD. None of these paths requires the Reach API or relayer."),
    section("outage", "If the native vault is unavailable", "After taking shares, the recipient may use the wrapper's redeemInKind to receive native sMUSD principal and idle MUSD. A contract recipient unable to initiate recovery calls relies on retrySettlement; this limitation is disclosed as F-04."),
  ]),
  article("sdk", "Developers", "SDK setup and reads", "Use the real TypeScript SDK from the monorepo.", "packages/sdk/src/index.ts", [
    section("install", "Install from source", "The SDK is a private workspace package, not an advertised public npm release. Clone the repository, use Node 20 or newer and pnpm 11, then run pnpm install with the pinned lockfile. Import @musd-reach/sdk from a workspace package."),
    section("reads", "Initialize and read", "buildConfig accepts the recorded deployment; createReachClients creates the Mezo and Base public clients. readPosition reads wallet holdings and gas, readWrapperState reads NAV, and reconcile checks backing. The Developers page displays the typechecked integration example from this repository."),
    section("errors", "Handle unavailable data", "Catch RPC failures and show UNKNOWN or stale data with an observation time. Never replace a failed balance read with zero. Amounts are bigint base units; use formatAmount and parseAmount at the display boundary."),
  ]),
  article("contracts", "Developers", "Contract registry and ABIs", "Pin identities, chains and the current deployment version.", "deployments/testnet.json", [
    section("registry", "Use v2", "The Contracts page lists the current v2 wrapper, gateways and receipt from the recorded deployment. Historical v1 stays live but is affected by F-01 and is not offered for new actions."),
    section("abis", "Find the ABIs", "packages/sdk/src/abis.ts exports the generated wrapper, gateway, receipt and Wormhole Core ABIs. packages/contracts/src contains contract source. Export ABIs from Foundry artifacts with pnpm abis when intentionally rebuilding them."),
    section("identity", "Check wiring", "Verify the destination's sourceGateway and wrapper, the source's remote gateway and receipt, and receipt.gateway. The verifier checks these on-chain. Verify runtime bytecode with immutables masked rather than assuming a token symbol identifies the contract."),
  ]),
  article("transaction-intents", "Developers", "Transaction intents", "Build explicit, bounded requests; keep signing separate.", "apps/web/src/lib/tx.ts", [
    section("scope", "Intent boundaries", "A deposit approves the exact entered amount to the wrapper or source gateway. A lock approves wSMUSD to the source gateway. A burn goes to the destination gateway. Always bind the chain, target, sender, function, amount and recipient."),
    section("simulate", "Before signing", "Check current account authorization and wallet chain, read balances and allowances, simulate the call and estimate gas. Mezo's gas policy applies an explicit floor because RPC estimates have omitted the calldata floor. The app prevents duplicate calls while a request is in flight."),
    section("receipts", "After signing", "A transaction hash is not success. Wait for a successful receipt, decode the relevant gateway event, preserve the tracker link and independently re-read balances. Rejections must leave an understandable, retryable state."),
  ]),
  article("api", "Developers", "Read API", "Optional indexed history and observations, never financial authority.", "apps/api/src/routes.ts", [
    section("base", "Availability", "The public API is hosted at https://musd-reach-api.onrender.com. Its free hosting may sleep. A slow response is not evidence that the contracts are down. /health checks the process; /ready checks indexer job freshness."),
    section("routes", "Useful endpoints", "GET /v1/transfers?address=0x… lists indexed transfers. The revised API returns nextCursor; pass it as cursor to load the next page. GET /v1/transfers/:id adds target consumption. /v1/wrapper/assets, /v1/positions/:wallet and /v1/backing/reconciliation expose chain reads."),
    section("bounds", "Errors and bounds", "Inputs are validated; amounts are integer base-unit strings bounded to uint256. Invalid requests return 400. Upstream failures return a generic 502. Respect rate limits and cache public observations. The API cannot approve, sign or move a user's funds."),
  ]),
  article("verifier", "Developers", "Independent verifier", "Recheck wiring, bytecode, backing and recorded evidence without the API.", "packages/verifier/src/cli.ts", [
    section("setup", "Prepare", "Install the monorepo dependencies. Build the contracts with Foundry before bytecode comparison so local runtime artifacts are available. The verifier is read-only and needs no wallet key."),
    section("commands", "Run the checks", "pnpm verify registry checks pinned chain facts. pnpm verify deployment checks contract wiring. pnpm verify bytecode compares runtime code. pnpm verify reconcile checks backing. pnpm verify all evidence/real-chain/testnet-2026-10-21T11-23-33-084Z.json rechecks the recorded v2 run."),
    section("scope", "Understand the result", "Recorded receipt success, VAA verification and consumed transfer IDs are evidence of specific past actions. Passing checks do not guarantee future liquidity, bridge availability, dollar value, guardian integrity or absence of undiscovered bugs. This is not an independent professional audit."),
  ]),
  article("events", "Developers", "Events and errors", "Derive the lifecycle from logs and verify state on chain.", "packages/sdk/src/abis.ts", [
    section("lifecycle", "Lifecycle events", "SharesLocked originates ISSUE, ReceiptMinted confirms the Base receipt, ReceiptBurned originates REDEEM, and SharesReleased or RedeemedToMusd confirms the Mezo payout. SettlementPending records an unresolved payout. PendingSettlementSharesClaimed records the recipient's share choice."),
    section("consumption", "Consumption", "MessageConsumed records authentication and replay protection. For a MUSD redemption, also read pendingSettlements: consumption can coexist with a pending payout. Persist the origin transaction and Wormhole sequence, not just a status label."),
    section("failures", "Failure handling", "AlreadyConsumed means a message was delivered before. SlippageExceeded protects a minimum. DepositsArePaused and IssuanceIsPaused apply to new entry, not exits. A failed RPC request is not a contract revert, and a rejected wallet request is not a mined transaction."),
  ]),
  article("integration-example", "Developers", "An integration from first read to acceptance", "Use the read-only example and design your own risk boundary.", "docs/THREAT_MODEL.md", [
    section("inspect", "Inspect first", "Read the current wrapper state, wallet receipt balance and cross-chain reconciliation using the typed example on the Developers page. Display each observation's chain block and distinguish indicative NAV from a tradable price."),
    section("accept", "Acceptance policy", "Confirm the exact token and gateway registry, require balanced backing, choose NAV freshness limits and account for Base finality plus guardian signing before an exit. A payment recipient must understand what it receives and how to redeem."),
    section("collateral", "Before collateral use", "Collateral requires a reviewed oracle, liquidity, market parameters and a working liquidation route. The Morpho test is fork-only and proves a technical path, not a live market, independent adoption or a safe collateral factor."),
  ]),
  article("risks", "Security", "Trust assumptions and risks", "Know what a backed receipt does and does not protect you from.", "docs/THREAT_MODEL.md", [
    section("custody", "Principal and vault risk", "The native Mezo vault and its owner control the savings principal. Impairment can reduce or block MUSD withdrawal. Wrapper holders share the economic exposure. In-kind exit removes reliance on a successful native withdrawal, not on the value of native sMUSD."),
    section("messages", "Messages and chains", "Wormhole guardians authenticate cross-chain instructions; testnet uses one key. Chain finality, RPC correctness and message availability matter. There is no timeout refund after an ISSUE lock, and redemption is asynchronous."),
    section("software", "Software and classification", "There has been no independent professional audit. A reported MetaMask malicious-site warning remains under investigation. Code review and passing tests do not clear that classification. Testnet assets have no value."),
  ]),
  article("permissions", "Security", "Contract permissions", "Understand the guardian and one-time gateway binding.", "docs/THREAT_MODEL.md", [
    section("guardian", "Pause authority", "The guardian may pause new wrapper deposits and new source locks. The guardian cannot pause exits, seize funds, mint receipts or rewrite a settlement. The current testnet guardian is an EOA, not a claimed decentralized control."),
    section("binding", "One-time binding", "The destination gateway binds to the source gateway once. Verify that binding and peer configuration on chain. The wrapper, gateways and receipt are not exposed as upgradeable Reach contracts."),
    section("users", "User approvals", "Approval lets the named spender transfer the stated token amount. The app uses exact-amount approvals rather than unlimited approvals. Connecting a wallet is separate from approval and must not request a signature that authorizes token movement."),
  ]),
  article("known-findings", "Security", "Known findings and disclosures", "Read the register; distinguish fixed source from deployed status.", "docs/SECURITY_FINDINGS.md", [
    section("v1", "Archived v1", "F-01 affects v1: a carefully gas-starved delivery could switch a requested MUSD payout to shares. Current v2 parks failed MUSD settlements and lets only the recipient change terms. D-01 discloses that v1 source is not reproducible from this repository's history."),
    section("remaining", "Disclosed limitations", "F-04 covers a contract recipient that cannot call recovery: it can rely only on retrySettlement. F-05 and other informational disclosures remain in the findings register. No frontend improvement removes guardian or native-vault trust."),
    section("current", "Current investigation", "The MetaMask warning has not been declared a false positive or cleared. Follow the Security status page for the distinction between observed source behavior, public list checks and a provider's classification. New frontend fixes require separate deployment verification."),
  ]),
  article("audit-status", "Security", "Audit and evidence status", "Tests, an internal review and an external audit are different things.", "docs/STATUS.md", [
    section("tested", "What has evidence", "The repository retains a public v2 round trip, recorded transactions and VAAs, local invariant tests and labelled fork tests. The independent verifier re-reads public chain state without using the Reach API."),
    section("not-audit", "What has not happened", "No independent professional security audit or external participant usability study has been claimed. Scripted browser checks exercise specific behaviors; they do not establish that a user understands the product or that a security-provider warning is wrong."),
    section("release", "Release boundaries", "Source fixes, local builds and hosted deployments are tracked separately. Wallet connection and signing are enabled for verified wallets. The reported MetaMask classification stays open and its notice stays in the chooser until it is resolved and independently retested in a normal security-enabled wallet."),
  ]),
  article("rpc", "Operations", "RPC configuration", "Use chain-specific endpoints and distinguish failures from zero balances.", "docs/DEPLOYMENT.md", [
    section("browser", "Browser endpoints", "NEXT_PUBLIC_MEZO_RPC and NEXT_PUBLIC_BASE_RPC select public browser RPCs. They are public build-time values; do not place a secret API credential in them. The browser fallback list also includes public endpoints."),
    section("server", "Server endpoints", "The API accepts MEZO_TESTNET_RPC and BASE_SEPOLIA_RPC with optional fallbacks. Endpoint log-range limits vary; the SDK splits rejected ranges adaptively. Persistent failures need investigation rather than an invented data substitute."),
    section("csp", "CSP", "Production uses per-request script nonces and an explicit connection allowlist. Any new RPC or API origin must be represented in the configured CSP. Keep script execution restricted; do not add unsafe-eval to production to make an integration work."),
  ]),
  article("relaying", "Operations", "Permissionless relaying", "Deliver signed messages without controlling their contents.", "apps/api/src/relay.ts", [
    section("optional", "The Reach relayer is optional", "The API tracks guardian signatures and can deliver them if a dedicated funded relayer key file is configured. The contracts do not grant that relayer payout authority. A user or another operator can deliver the same valid VAA."),
    section("gas", "Gas and retries", "Delivery must have enough gas for the intended settlement. v2 deliberately reverts gas-starved attempts. Retrying a parked settlement preserves the original minimum; it must not silently change the payout asset."),
    section("keys", "Operational keys", "Never put a relayer key in a browser variable, source file or public evidence. Do not reuse an exposed key or a user's primary wallet. This remediation assignment does not execute transactions or configure a funded relayer."),
  ]),
  article("indexing", "Operations", "Indexer and cold starts", "History is a recoverable cache of chain events.", "apps/api/src/indexer.ts", [
    section("cursor", "Progress", "Each chain has a cursor and a finalized block observation. A successful indexing tick can be healthy while still catching up. /ready checks recent indexer success; compare cursor progress to the chain head before describing history as complete."),
    section("recovery", "Reorg recovery", "Unfinalized blocks are rechecked. A mismatch deletes orphaned events and persists a rewind. Derived transfers drop orphaned origins and refresh reincluded transaction details. Timestamp migration backfills the origin times used for cross-chain history ordering."),
    section("sleep", "Free-hosting sleep", "Render Free may hold a first request while waking. The interface allows for that delay and announces a waking service. Failure of history does not prove loss of custody or contract failure; balance and backing reads use chain RPCs."),
  ]),
  article("troubleshooting", "Operations", "Troubleshooting", "Find the stage that failed before retrying.", "docs/TESTING.md", [
    section("connection", "Cannot connect", "Do not bypass a malicious-site warning. If a connection is rejected, no transaction has been sent. If a browser wallet is missing, install it from the vendor's own site — the chooser links there — or connect with WalletConnect from a mobile wallet."),
    section("transaction", "A transaction failed", "A rejected signature, failed simulation, pending transaction and mined revert are different states. Inspect the tracker or explorer using the transaction hash. Do not repeatedly click a pending action. Check the correct network's token and gas balance."),
    section("message", "A message is delayed", "Check source receipt, finality, guardian signing and target consumption in that order. A signed VAA can be delivered later. For a consumed MUSD redemption, inspect pending settlement and use only the recovery actions available to the recipient or permissionless retry."),
  ]),
  article("limitations", "Operations", "Current limitations", "An explicit boundary around what is available today.", "docs/STATUS.md", [
    section("scope", "Testnet scope", "Reach supports Mezo testnet and Base Sepolia only. It has no mainnet deployment, no promised yield, no dollar peg and no live borrowing product. No independent application has been demonstrated to accept rwSMUSD."),
    section("integration", "Integration scope", "Morpho acceptance, borrow and liquidation have been tested on a local Base mainnet fork. There is no public funded Morpho market, independent curator, reviewed production oracle or demonstrated public liquidator."),
    section("release", "Release blockers", "The reported MetaMask warning remains unresolved. Normal real-wallet signing is not verified in this remediation pass, and no transactions will be sent for it. Provider review and authorized publication are separate from implementing and testing the source changes."),
  ]),
];

export const docGroups = [...new Set(articles.map((a) => a.group))];
