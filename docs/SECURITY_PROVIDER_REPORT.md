# Classification review request: musd-reach.vercel.app

Submitted with explicit owner approval: https://github.com/MetaMask/eth-phishing-detect/issues/305589.
Submission is not clearance; normal-wallet retesting remains blocked pending review.

Affected URL: **https://musd-reach.vercel.app/**

The project owner reports that MetaMask shows **“Malicious — flagged as unsafe” during
connection**. We are requesting investigation of the classification, not asserting that it
is a false positive. No one is being asked to bypass a warning or turn off security features.

## Reproduction information

- Stage: connecting a wallet, as confirmed by the reporter.
- Wallet platform/version, provider-specific report ID and original warning screenshot:
  not yet supplied. The page screenshots captured by the developer are not substituted
  for a screenshot of the wallet alert.
- Status: not independently cleared in a normal, security-enabled MetaMask installation.
- A local remediation build disables wallet connectors, automatic reconnection and write
  entry points while review is open. That build has not been published to production.

## Source and deployment evidence

- Repository: https://github.com/TheWeirdDee/musd-reach
- Public source head observed: `e0e4d537adf405801de0ff3773d3348cb2870a05`.
- GitHub records a successful Vercel check for that SHA, pointing to deployment
  `2DZ9ZdrirLGiiFFYzjzcS2YRes4n` in project `musd-reach`. A GitHub success does not by
  itself establish which revision the production alias currently serves. Authenticated
  Vercel alias metadata remains necessary for complete provenance confirmation.
- Source: https://github.com/TheWeirdDee/musd-reach/tree/e0e4d537adf405801de0ff3773d3348cb2870a05
- Current v2 registry: https://github.com/TheWeirdDee/musd-reach/blob/main/deployments/testnet.json
- Findings and limitations: https://github.com/TheWeirdDee/musd-reach/blob/main/docs/SECURITY_FINDINGS.md
- Public lifecycle: https://github.com/TheWeirdDee/musd-reach/blob/main/evidence/real-chain/testnet-2026-10-21T11-23-33-084Z.json

## What the app is

Experimental testnet software that keeps MUSD in Mezo's native savings vault and represents
a locked wrapper-share claim as an ERC-20 receipt on Base Sepolia. No mainnet deployment,
public borrowing market, promised yield or independent professional audit is claimed.
Testnet uses a single Wormhole guardian key; that trust assumption is disclosed.

Current v2 contracts:

| Contract | Network | Address |
|---|---|---|
| ReachSavingsWrapper | Mezo testnet, 31611 | `0xf8cF6fCCC7bcF2860BfAD1Ea4A6018D446eb4306` |
| ReachSourceGateway | Mezo testnet, 31611 | `0xA5c70F8D6B329ED6c2d15D604B66FafC3A6C96d3` |
| ReachDestinationGateway | Base Sepolia, 84532 | `0x50436eB8F8213c7df773F2c331Bb41e1fecb5a23` |
| RemoteWrapperReceipt | Base Sepolia, 84532 | `0x02777A938e69f848d4413b9033D225f0D1444e89` |

## Wallet and network review

Source connection goes through wagmi's injected connector after a user clicks a wallet.
Account visibility/permission requests are separate from network switching and financial
transactions. The financial UI has no permit, `eth_sign`, `personal_sign` or typed-data
signature flow. It does not request recovery phrases, private keys or wallet exports.
Approvals are exact-amount and targeted to the recorded wrapper/source gateway. Burns go
to the recorded destination gateway. This inventory is source-level; a detailed runtime
request capture is retained separately in the local remediation evidence.

The disconnected deployed route sweep observed only these origins:

- `https://musd-reach.vercel.app`
- `https://rpc.test.mezo.org`
- `https://base-sepolia-rpc.publicnode.com`
- `https://sepolia.base.org`
- `https://musd-reach-api.onrender.com`

Deployed script hashes and CSP observations have been captured. Their presence does not
establish reproducible source-to-build equivalence. The production CSP uses per-request
nonces; no third-party script origin was observed in the disconnected sweep.

The official public MetaMask `src/config.json` fetched during this investigation had no
exact or parent-domain entry for this hostname. This does not rule out fuzzy matching,
another list, a security partner's classification, dynamic analysis or a cached result.

Dependency advisories were found and compatible security patches are being applied.
Remaining third-party wallet dependency advisories are explicitly disclosed rather than
treated as proof of compromise or ignored. No causal link to the reported connection
warning has been established.

## Requested assistance

Please identify the classification source and relevant evidence, and review whether the
domain classification is correct. If a request pattern, domain, contract or resource needs
remediation, please identify it so the project can investigate. The owner can supply the
original warning screenshot and wallet version when available.

We will not claim clearance until it has been independently confirmed in a normal wallet
with security protections enabled. No public-chain transactions were executed for this
investigation, and the deployed contracts and historical public evidence were preserved.
