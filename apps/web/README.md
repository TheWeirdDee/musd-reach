# @musd-reach/web

Next.js 16 frontend for MUSD Reach: landing page, portfolio, wrap, make portable, redeem, transfer tracker, history, proof explorer, status, integrations, developers and risks.

Every financial figure is read from chain in the browser through viem/wagmi and `@musd-reach/sdk`. The optional indexer API (`NEXT_PUBLIC_API_URL`) supplies history only.

```bash
node ../../scripts/sync-web-data.mjs   # copy the deployment record and evidence runs into src/generated
pnpm dev                               # http://localhost:3000
pnpm build
```

| Env | Purpose |
|---|---|
| `NEXT_PUBLIC_API_URL` | Optional indexer API for history and messaging health |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Optional WalletConnect |
| `NEXT_PUBLIC_MEZO_RPC`, `NEXT_PUBLIC_BASE_RPC` | Optional RPC overrides; they take precedence |
| `NEXT_PUBLIC_REACH_DEPLOYMENT`, `NEXT_PUBLIC_NETWORK_MODE=fork`, `NEXT_PUBLIC_E2E_ACCOUNT` | **Local fork testing only** (see `docs/TESTING.md`); never set in production |

Browser E2E on local forks: `e2e/fork-flows.mjs` (see `docs/TESTING.md`).
