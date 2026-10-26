/**
 * Status of the MetaMask classification review (finding F-33).
 *
 * This is a report from one wallet provider about this domain, not a finding against the
 * application. The checks recorded in `docs/SECURITY_FINDINGS.md` (contract targets, exact-amount
 * approvals, request surface, CSP, bundle and dependency review) found no application defect that
 * would justify pausing every wallet, so connection and signing are available for independently
 * verified wallets again. MetaMask keeps its own contextual notice inside the wallet chooser
 * (`src/lib/wallets.ts`); the classification itself is still open and is never reported as cleared.
 *
 * Never change `status` to cleared without a normal, security-enabled MetaMask retest against the
 * live site.
 */
export const walletSafety = {
  status: "under-investigation",
  reportedAt: "2026-10-25",
  reason: "A malicious-site warning was reported during MetaMask connection. Its classification has not been cleared.",
} as const;