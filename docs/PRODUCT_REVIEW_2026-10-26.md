# Product and wallet-safety review - 26 October 2026

Historical review snapshot. The reviewed build is now hosted (`e67559f` checked 26 October); wallet classification remains unresolved. Current follow-up and deployment status: [STATUS.md](STATUS.md). The local-only statements below describe the original review checkpoint.
This is an engineering self-review using seven user perspectives, not an independent
professional audit or a study with external human participants.

## Security investigation

The owner confirmed the warning appears while connecting. The original screenshot,
MetaMask version/platform, provider identity and reference ID remain unavailable.
A public-list exact/parent-domain lookup did not find the hostname. That observation
does not establish that another classifier, fuzzy match or request analysis clears it.
No cause or false-positive conclusion is claimed.

The owner approved the public report, submitted as
[MetaMask issue 305589](https://github.com/MetaMask/eth-phishing-detect/issues/305589).
On 26 October the issue was OPEN with no comments. Submission is not clearance.
The production rebuild disables connectors, automatic reconnection and transaction
writes, and links to the investigation. The keyless test switch is development-only;
production configuration rejects it. WalletConnect is not offered in this build.
No recovery phrase, private key, permit or unrelated signature is requested by the UI.

Read-only deployed-route captures found only the site and configured RPC/API origins.
The public GitHub status records a successful Vercel build for
`e0e4d537adf405801de0ff3773d3348cb2870a05`. Public information does not prove the
production alias currently resolves to that exact artifact. Authenticated alias metadata
and a normal, security-enabled MetaMask reproduction remain outstanding.
The new web/API version endpoints expose a platform-provided revision or null rather
than guessing. Loaded-script hashes and network origins are retained in the audit JSON.

Compatible dependency patches were applied. Three wallet dependency advisories remain
(zod 3.x, uuid, decode-uri-component); see F-34 and the dependency audit. No causal
relationship to the reported warning has been established. Do not bypass wallet security.

## Findings and regressions

| ID | Impact | Root cause and local correction | Verification |
|---|---|---|---|
| PR-01 | Medium | Failed settlement read was treated as zero; success is now required | Settlement/history browser suite |
| PR-02 | Medium | Reorg derivation retained orphaned transfers; remove missing origins and atomically rewind | API reorg/restart regressions |
| PR-03 | Medium | Reinclusion retained old origin and cached digest; refresh origin fields and invalidate digest | API reinclusion regression |
| PR-04 | Medium | Block-only pagination skipped same-block entries; timestamp/ID cursor across chains | API pagination/migration tests |
| PR-05 | Low | History stopped at 50; add cursor paging, dedupe, direction/status filters and UTC dates | API filters and browser paging |
| PR-06 | Low | README hosting claim contradicted deployments; correct hosting/cold-start description | Documentation review |
| PR-07 | High, open | Reported MetaMask classification lacks independent reproduction/decision; hold connections and writes | Production safety-hold assertions; provider review pending |
| PR-08 | Medium | Missing exact gas/balance readiness could allow unusable intents; estimate exact next call, fail closed and recheck account | Keyless wallet-state suite |
| PR-09 | Medium | Repeated pending clicks and edits could change intent; freeze inputs and guard in-flight submission | Pending-request regression |
| PR-10 | Medium | Amount sanitization could reinterpret malformed input; preserve and reject it, reject zero recipient | Mobile malformed amount and recipient regressions |
| PR-11 | Low | Transaction screens reused public footer and nested cards; dedicated app shell and workspace | Route/footer assertions and screenshots |
| PR-12 | Low | Missing docs, registry and route metadata; add sourced guides, branded assets and canonical/social metadata | Production acceptance and route inventory |
| PR-13 | Medium | Status conflated service responses and chain health; independent observations with unknown/stale states | Unavailable-service browser fixtures |
| PR-14 | Low | Backdrop filter constrained fixed mobile menu; remove blur while menu is open | Normal mobile click regression |
| PR-15 | Low | Long Proof badge and run controls overflowed phones; shorten badge and wrap controls | Responsive sweep |
| PR-17 | Serious accessibility | Horizontally scrollable integrations matrix lacked keyboard access; label it and make it focusable | Focused axe regression |
| PR-16 | Medium, partial | Dependency advisories; apply compatible overrides without forcing incompatible majors | npm dependency audit |

## Page-by-page review

| Surface | Purpose and changes |
|---|---|
| Landing | Preserve factual savings/claim explanation; surface safety hold, docs and proof |
| Portfolio | Separate onboarding from connected holdings; support read-only address inspection, block observations, recent activity and pending recovery reads |
| Wrap | Real balances, raw amount validation, exact approval/next-call gas, recipient checks and explicit review |
| Make portable | Existing-share onboarding, source custody and asynchronous destination issuance explained; exact lock intent |
| Redeem | Share/MUSD modes, minimum policy, Base finality and pending settlement explained; exact burn intent |
| History | Multi-chain chronological pagination, filters, dates, dedupe and index coverage uncertainty |
| Tracker | Distinguish message delivery from payout; failed pending read cannot declare settlement |
| Proof/run | Recorded versus live evidence, v1/v2 distinction, lifecycle/filter/search and repeatable receipt checks |
| Integrations | Actual compatibility matrix, absence of borrowing markets and oracle/liquidity/recipient limitations |
| Developers | Workspace setup, typechecked read-only SDK example, ABI/registry links and recovery/operations guidance |
| Docs/articles | Sourced guides, navigation filtering, mobile disclosure, TOC/deep links, previous/next and copyable code |
| Contracts | Recorded addresses, roles, deployment blocks, native dependencies, source and explorer links |
| Status | Independent chain heads/timestamps, API/index progress, backing, finality, observer availability and stale/unknown states |
| Risks/security | Existing disclosures preserved; investigation and release hold stated explicitly |

The self-review considered a first-time saver (onboarding and asset requirements), a
returning holder (balances/history), a wallet user (account/network/intent), an integrator
(identities/examples), an operator (readiness/recovery), a mobile user (menu/layout), and
a judge (recorded proof versus live observations). Shared article templates were reviewed
with article route inventories; this does not establish that every prose claim has had an
external audit. Screenshots are evidence of rendering, not proof of protocol correctness.

## Verification and evidence

| Check | Result | Evidence |
|---|---|---|
| SDK | 13/13 | [transcript](../evidence/product-review/sdk-tests.txt) |
| API | 23/23 | [transcript](../evidence/product-review/api-tests.txt) |
| Workspace TypeScript | All five checks passed | [transcript](../evidence/product-review/typecheck.txt) |
| ESLint | Passed | [transcript](../evidence/product-review/lint.txt) |
| Production build | Passed, 55 generated entries | [transcript](../evidence/product-review/production-build.txt) |
| Keyless wallet states | 34/34 | [transcript](../evidence/product-review/wallet-states-final.txt) |
| Live-read rejecting-wallet intents | 35/35 | [transcript](../evidence/product-review/keyless-tx-intent-final.txt) |
| Production acceptance | 91/91 | [transcript](../evidence/product-review/acceptance.txt), [assertions](../evidence/product-review/acceptance.json) |
| Settlement/history | 7/7 | [transcript](../evidence/product-review/settlement-history.txt) |
| CSP/enforcement/hydration | 29/29 | [transcript](../evidence/product-review/csp.txt) |
| Keyboard | 8/8, including mobile matrix arrow scrolling | [final transcript](../evidence/product-review/keyboard-final.txt) |
| Responsive | 420/420 | [transcript](../evidence/product-review/responsive.txt) |
| Accessibility | Initial 38 scans found one serious scroll-region issue; final focused desktop/mobile scans have no violations | [initial finding](../evidence/product-review/accessibility.txt), [final retest](../evidence/product-review/accessibility-final.txt) |
| Route captures/metadata | 94 captures across 47 routes, no errors/overflow; heading, description and canonical checks pass | [inventory](../evidence/product-review/after/audit.json) |

The broad browser and route sweeps precede the final focus-only change to the integrations matrix. The final artifact is rebuilt, and that changed surface is retested with axe and actual keyboard scrolling. No layout or financial logic changed in that last patch.

The responsive matrix uses widths 320, 360, 375, 390, 430, 768, 1024, 1280,
1440 and 1920; both motion settings; short/tall and mobile landscape viewports.
The clipboard regression compares the exact source after platform newline normalization;
Windows clipboard CRLF conversion does not change the code.

The source changes and local per-file commit SHAs are listed in
[change inventory](../evidence/product-review/change-inventory.json) and
[source commits](../evidence/product-review/source-commits.json). Contract source,
deployment records and protocol registry were not changed. Source review also checked
tracked/untracked candidate text for private-key headers and common credential patterns;
no matches were found. This check is not a general secret-detection guarantee.

Before screenshots: [deployed capture inventory](../evidence/product-review/before/audit.json).
After screenshots: [local production capture inventory](../evidence/product-review/after/audit.json).
Connected screenshots use explicitly mocked RPC data and rejecting wallets; they are not
live-balance evidence. Before/after route captures otherwise read actual public services.

The fresh read-only verifier passed **62/62** at 2026-10-26T05:30:12.998Z:
[live verifier](../evidence/product-review/live-verifier-2026-10-26.json).
No blockchain transaction was sent in this investigation, including on local forks.
Earlier fork evidence dated 25 October belongs to the prior authorized review and must
not be represented as execution during this no-transaction task. Extension signing is
unverified; all new wallet fixtures reject signing and broadcasting.

## Deployment control

Do not push this review branch to the production branch yet. Existing main-branch Vercel
status demonstrates automatic deployment. The user's release instruction requires approval
before publishing while the wallet warning is unresolved. Prepare a preview with wallet
hold intact and verify web/API together; the new history UI consumes `nextCursor`.
API migration 002 applies on startup and rewinds indexing to backfill event timestamps.
A snapshot/restore plan and healthy index catch-up should precede production traffic.

Approval of the public MetaMask report does not authorize a production deployment.
Remaining manual actions: supply original warning/platform/provider details, obtain the
classification review, retest a normal MetaMask connection with protections enabled,
confirm the authenticated Vercel alias revision, approve the deployment approach, and
rerun hosted acceptance and version checks after any authorized deployment.


## Revisions

Remote main at review: `e0e4d537adf405801de0ff3773d3348cb2870a05`.
Initial source commit range on local `review/security-rebuild-2026-10-26`:
`90186d5f3586b4439ad242439b72543d4433dbc6` through
`3b86cf0abdb3b7439ab667cf152a0f56d2e51bf5` (99 one-file commits).
Six additional one-file correction commits end at source revision
`47995c16cb0297192cc87ff0d0caf2a664eb78af` (105 per-file commits in total).
The final report/evidence commit follows that range;
`git rev-parse HEAD` identifies the complete local review. No remote push was performed.

The live-read lock account `0x3a71111bb6578Beb61E39af9C09223c02b41D701` was read
with zero Mezo native balance and zero allowance; its exact approval still estimates
46,451 gas. The earlier test expected a signing request despite the new gas gate and
failed. The corrected regression asserts a disabled action and no signing request when
native gas is insufficient. The sufficient-gas lock calldata is checked separately with
explicit fixtures, without funding this public account.


## Screenshot comparisons and full inventory

| Surface | Before (hosted) | After (local production) |
|---|---|---|
| Wrap, mobile | [before](../evidence/product-review/before/app-wrap-390.png) | [after](../evidence/product-review/after/app-wrap-390.png) |
| Developers | [before](../evidence/product-review/before/developers-1280.png) | [after](../evidence/product-review/after/developers-1280.png) |
| Proof, mobile | [before](../evidence/product-review/before/proof-390.png) | [after](../evidence/product-review/after/proof-390.png) |
| Docs | [before: absent route](../evidence/product-review/before/docs-1280.png) | [after](../evidence/product-review/after/docs-1280.png) |

[Full changed-file inventory](../evidence/product-review/change-inventory.json) includes
source, docs, tests, generated branding and evidence. [Contact sheet 1](../evidence/product-review/contact-1.png),
[2](../evidence/product-review/contact-2.png), [3](../evidence/product-review/contact-3.png),
[4](../evidence/product-review/contact-4.png) provide a route overview; full-size images
are linked from the capture inventory. The last focus-only patch does not change layout;
[its final keyboard capture](../evidence/product-review/integrations-keyboard-390.png)
shows the accessible matrix on the final production artifact.

Initial failed exploratory logs are retained as such. They are superseded only by the
explicitly linked final runs, not silently counted as passes. The report does not claim
that every legacy transaction/fork script was executed during this task.
