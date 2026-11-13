# Test MUSD Reach yourself

Everything runs on public testnets with free faucet tokens. Nothing here costs real money.

- **App:** https://musd-reach.vercel.app
- **Guided page with live checkmarks:** https://musd-reach.vercel.app/start

There are two paths. **Path A** takes about 5 minutes and only needs Base Sepolia. **Path B** is the full loop (save on Mezo, borrow MUSD on Base, bring it home on Mezo's bridge) and takes about 30 minutes, mostly waiting for Wormhole signatures.

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
| **Route kit: test MUSD + gas on both chains** (start here) | https://musd-reach.vercel.app/start | Connect any wallet (it can be empty), then click **Get my free route kit** at the top. Reach's relayer sends **25 test MUSD and gas BTC on Mezo, plus gas ETH on Base**: no faucet, no signature. One kit per wallet (20 a day). If today's kits are gone, use the faucets in this table, and mint MUSD at https://testnet.mezo.org/borrow (the **minimum loan is 1,800 MUSD**, so post **at least 0.04 BTC** as collateral). |

---

## Path A: Lend to Mezo savers (about 5 minutes)

You need: Base Sepolia ETH and Base Sepolia USDC.

1. Open https://musd-reach.vercel.app/app/lend and click **Connect**.
2. Enter an amount of USDC (for example, `5`).
3. Click **Deposit USDC**. Approve USDC in your wallet, then confirm the deposit.
4. Done. Your deposit appears under **Your deposit**, and your address appears under **Live market** on https://musd-reach.vercel.app/proof.
5. *(Optional)* Switch to **Withdraw** to take the USDC back out.

**What you just did:** your USDC went into the Reach USDC Vault (a Morpho Vault V2). The vault lends it into a Morpho Blue market where every borrower has posted a claim on MUSD savings locked on Mezo.

**Prefer to lend MUSD?** Get the route kit on https://musd-reach.vercel.app/start, bridge it to Base at https://musd-reach.vercel.app/app/bridge (**Mezo → Base**), then choose **Lend MUSD** on the Lend page.

---

## Path B: Save on Mezo, borrow MUSD on Base, bring it home (about 30 minutes)

You need: the free route kit (it covers MUSD and gas on both chains).

1. **Make your savings portable.** Open https://musd-reach.vercel.app/app/portable/new, enter an amount of MUSD (for example, `100`) and confirm. Your MUSD goes into Mezo's Savings Vault, and the wrapper shares are locked for Base.
2. **Wait for delivery.** The app opens a tracker. When the Wormhole guardians sign (usually a few minutes on testnet), click **Deliver on Base**. You now hold **rwSMUSD** on Base.
3. **Borrow MUSD.** Open https://musd-reach.vercel.app/app/borrow?asset=MUSD. Enter rwSMUSD to post as collateral and an amount of MUSD to borrow (stay under the maximum shown). Confirm the approval, the collateral and the borrow. Watch your **Health** value: keep it above 1.4. (Choose **Borrow USDC** instead if you prefer.)
4. **Take the MUSD home.** Open https://musd-reach.vercel.app/app/bridge, choose **Base → Mezo**, enter the MUSD and click **Send to Mezo testnet**. When the guardians sign, click **Deliver on Mezo testnet**. This uses Mezo's own MUSD bridge. You can now make that MUSD portable again (step 1) to loop.
5. **Repay.** On **Borrow**, switch to **Repay & withdraw**, repay the MUSD (bridge some back to Base first if needed) and withdraw your rwSMUSD.
6. **Bring the savings home.** Open https://musd-reach.vercel.app/app/redeem, burn your rwSMUSD and choose **wSMUSD shares** or **MUSD** on Mezo. After guardian signing, deliver the return message from the tracker. Your savings are back on Mezo, with the yield they earned the whole time.

---

## Report what happened

Open an issue at https://github.com/TheWeirdDee/musd-reach/issues with:

- your wallet address,
- the path you tried (A or B) and the step number,
- what you expected, and what you saw (a screenshot helps).
