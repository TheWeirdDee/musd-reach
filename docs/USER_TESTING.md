# Test MUSD Reach yourself

Everything runs on public testnets with free faucet tokens. Nothing here costs real money.

- **App:** https://musd-reach.vercel.app
- **Guided page with live checkmarks:** https://musd-reach.vercel.app/start

There are two paths. **Path A** takes about 5 minutes and only needs Base Sepolia. **Path B** is the full loop (save on Mezo, borrow on Base, bring it home) and takes about 45 minutes, mostly waiting for Wormhole delivery.

---

## 1. Set up your wallet

Use any browser wallet that supports custom networks (Rabby, MetaMask, Coinbase Wallet). The app asks your wallet to add or switch networks when needed. To add them by hand, use these details:

| Network | Chain ID | RPC URL | Gas token | Explorer |
|---|---|---|---|---|
| **Base Sepolia** | 84532 | https://sepolia.base.org | ETH | https://base-sepolia.blockscout.com |
| **Mezo testnet** | 31611 | https://rpc.test.mezo.org | BTC | https://explorer.test.mezo.org |

> **MetaMask note:** MetaMask may show a warning on `musd-reach.vercel.app`. A review is in progress. Rabby or Coinbase Wallet connect without it.

---

## 2. Get test tokens

| You need | Where | How |
|---|---|---|
| **Base Sepolia ETH** (gas on Base) | https://console.optimism.io/faucet | Sign in with GitHub, pick **Base Sepolia**, paste your address, click **Claim** (once every 24 hours). 0.01 ETH covers far more than this guide needs. Backups: https://portal.cdp.coinbase.com/products/faucet (Coinbase account) and https://www.alchemy.com/faucets/base-sepolia (needs a small mainnet ETH balance). |
| **Base Sepolia USDC** (to lend or repay) | https://faucet.circle.com | Choose **USDC**, network **Base Sepolia**, paste your address, click **Send**. Repeat after the cooldown if you need more. |
| **Mezo testnet BTC** (gas and collateral on Mezo; Path B only) | https://faucet.test.mezo.org | Paste your address and request BTC. |
| **Mezo testnet MUSD** (Path B only) | https://testnet.mezo.org/borrow | Connect on Mezo testnet and open a loan. The **minimum loan is 1,800 MUSD**. With BTC at about $74,000 on testnet, post **at least 0.04 BTC** as collateral to stay above the 150% collateral ratio. |

---

## Path A: Lend USDC to Mezo savers (about 5 minutes)

You need: Base Sepolia ETH and Base Sepolia USDC.

1. Open https://musd-reach.vercel.app/app/lend and click **Connect**.
2. Enter an amount of USDC (for example, `5`).
3. Click **Deposit USDC**. Approve USDC in your wallet, then confirm the deposit.
4. Done. Your deposit appears under **Your deposit**, and your address appears under **Live market** on https://musd-reach.vercel.app/proof.
5. *(Optional)* Switch to **Withdraw** to take the USDC back out.

**What you just did:** your USDC went into the Reach USDC Vault (a Morpho Vault V2). The vault lends it into a Morpho Blue market where every borrower has posted a claim on MUSD savings locked on Mezo.

---

## Path B: Save on Mezo, borrow on Base, bring it home (about 45 minutes)

You need: Mezo testnet BTC and MUSD, and Base Sepolia ETH.

1. **Make your savings portable.** Open https://musd-reach.vercel.app/app/portable/new, enter an amount of MUSD (for example, `100`) and confirm. Your MUSD goes into Mezo's Savings Vault, and the wrapper shares are locked for Base.
2. **Wait for delivery.** The app opens a tracker. When the Wormhole guardians sign (usually 10 to 30 minutes on testnet), click **Deliver on Base**. You now hold **rwSMUSD** on Base.
3. **Borrow.** Open https://musd-reach.vercel.app/app/borrow. Enter rwSMUSD to post as collateral and an amount of USDC to borrow (stay under the maximum shown). Confirm the approval, the collateral and the borrow. Watch your **Health** value: keep it above 1.4.
4. **Repay.** Get USDC from https://faucet.circle.com if you spent it. On **Borrow**, switch to **Repay & withdraw**, repay the USDC and withdraw your rwSMUSD.
5. **Bring it home.** Open https://musd-reach.vercel.app/app/redeem, burn your rwSMUSD and choose **wSMUSD shares** or **MUSD** on Mezo. After guardian signing, deliver the return message from the tracker. Your savings are back on Mezo, with the yield they earned the whole time.

---

## Report what happened

Open an issue at https://github.com/TheWeirdDee/musd-reach/issues with:

- your wallet address,
- the path you tried (A or B) and the step number,
- what you expected, and what you saw (a screenshot helps).
