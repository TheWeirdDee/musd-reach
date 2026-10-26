# MUSD Reach — 2-Minute Pitch Video Production Script

**Target Duration:** 1:57 (117 seconds)  
**Strict Upper Limit:** 2:00 (120 seconds)  
**Format:** 1920 × 1080 @ 30 FPS, H.264 / AAC  
**Voice Style:** Confident, clear, articulate, professional tech pitch  
**Tone:** Practical, engineer-level honesty, zero hype  

---

## Storyboard & Voiceover Breakdown

### Scene 1: The Problem & The Hook (0:00 – 0:12) [12s]
- **Visuals:** 
  - Dynamic intro title showing MUSD Reach logo and Mezo ecosystem badge.
  - Split interface showing Mezo Native Savings vault alongside external ecosystem icons (Base, Morpho, DeFi).
  - Subtle graphic highlighting the friction: moving savings today requires withdrawing principal, losing accrued position, and bridging raw stablecoins.
- **Voiceover:**
  > "What if your savings could stay on Mezo, while you used a claim on them on another blockchain? Today, moving savings value elsewhere means withdrawing first, forfeiting your position, and bridging raw stablecoins."
- **Lower Third Badge:** `The Problem: Trapped Native Savings Liquidity`

---

### Scene 2: The Solution (0:12 – 0:25) [13s]
- **Visuals:**
  - Architecture flow on the live application UI: Mezo Savings (`sMUSD`) $\rightarrow$ ERC-4626 Wrapper (`wSMUSD`) $\rightarrow$ Locked in Source Gateway $\rightarrow$ Wormhole cross-chain message $\rightarrow$ Backed Receipt (`rwSMUSD`) on Base Sepolia.
  - Screen focus on the clean, responsive web application at `https://musd-reach.vercel.app/`.
- **Voiceover:**
  > "MUSD Reach changes that. Your savings position stays right on Mezo. We wrap and lock the corresponding savings shares, then issue a backed, transferable receipt on Base Sepolia."
- **Lower Third Badge:** `MUSD Reach Architecture: Mezo 31611 ↔ Base Sepolia 84532`

---

### Scene 3: Live Savings & Lock on Mezo (0:25 – 0:45) [20s]
- **Visuals:**
  - Live footage from the deployed application: connecting authorized testnet wallet (`0x0F57...Efe6`).
  - Balance display: 1,797.5 MUSD available on Mezo testnet.
  - User enters 6 MUSD into the Wrap & Lock workflow.
  - Review drawer opens: showing exact transaction parameters, gas estimate, and recipient address.
  - Wallet sign action; block confirmation at block `16279430` (tx `0x1fdf...99d7`).
  - Live Mezo testnet explorer verification showing `ReachSavingsWrapper` and `ReachSourceGateway` events.
- **Voiceover:**
  > "Here is the live application. I connect my wallet on Mezo testnet, enter six MUSD, and initiate the lock. In a single atomic transaction, the MUSD enters the native savings vault, shares are wrapped, and locked in the source gateway. Here is the confirmed transaction on Mezo testnet."
- **Lower Third Badge:** `Mezo Testnet Tx: 0x1fdfc665...99d7 | Block 16279430`

---

### Scene 4: Wormhole Cross-Chain Issuance (0:45 – 1:05) [20s]
- **Visuals:**
  - Live transfer tracking drawer displaying transfer ID `0x9fbde66ef230e7f12a6a4a3f86accf95ec3aca19e974b68f0ac9ae11246fc404`.
  - Wormhole message status transition: `Published` $\rightarrow$ `Guardian-Signed VAA` (digest `0x8e4a6b...`) $\rightarrow$ `Destination Delivery`.
  - Delivery on Base Sepolia at block `48406788` (tx `0x77f19efa...1455`).
  - BaseScan explorer confirmation showing 6 `rwSMUSD` minted to the recipient wallet.
- **Voiceover:**
  > "Wormhole carries the authenticated message to Base Sepolia. Once Wormhole guardians sign the proof, the destination gateway verifies every parameter, consumes the transfer ID, and mints exactly six rwSMUSD receipts. The underlying savings shares remain locked and safe on Mezo."
- **Lower Third Badge:** `Base Sepolia Mint Tx: 0x77f19efa...1455 | Wormhole VAA Verified`

---

### Scene 5: Transferability & Return Settlement (1:05 – 1:25) [20s]
- **Visuals:**
  - Primary wallet transfers 3 `rwSMUSD` to secondary wallet (`0x3a71...D701`) on Base Sepolia (tx `0x52c1...7760`).
  - Split screen showing updated balances for both independent wallets.
  - Return workflow: secondary wallet burns 3 `rwSMUSD` for shares; primary wallet burns for MUSD payout.
  - Wormhole return message verified on Mezo testnet; release transactions confirmed at block `16279630` and `16279632`.
  - Final wallet balance check on Mezo explorer.
- **Voiceover:**
  > "That receipt is a standard ERC-20. It can be held, traded, or transferred to another wallet—which we verified on BaseScan. And when the holder wants their value back, they burn the receipt on Base. The authenticated return message releases the corresponding shares or unwrapped MUSD directly on Mezo."
- **Lower Third Badge:** `Cross-Chain Settlement: Transfer, Burn & Release Verified`

---

### Scene 6: Mathematical Proof & Differentiation (1:25 – 1:42) [17s]
- **Visuals:**
  - Live Proof Dashboard at `https://musd-reach.vercel.app/proof`.
  - Conservation invariant display: `Locked wSMUSD == Remote Supply + In-Flight Messages`.
  - Discrepancy counter showing `0.000000000000000000` (Status: `BALANCED`).
  - Settlement recovery screen: showing how slippage-protected redemptions park gracefully and allow recipient recovery (tx `0x5165...2be9`).
- **Voiceover:**
  > "This is not just bridging tokens. It is making savings positions portable while keeping liquidity on Mezo. And you do not have to take our word for it: our public proof engine reconciles every locked share against issued receipts in real time, with sixty-two independent verification checks passing."
- **Lower Third Badge:** `Public Verification Engine: 62 / 62 Checks Passing (Discrepancy: 0)`

---

### Scene 7: Why It Matters & Conclusion (1:42 – 1:57) [15s]
- **Visuals:**
  - High-impact closing showcase: the complete MUSD Reach application ecosystem.
  - Key technical highlights: 100% Non-Custodial, Wormhole-Powered, Native Savings Preserved, Built for Mezo 2026.
  - Clean title card with project links:
    - **Live App:** `musd-reach.vercel.app`
    - **GitHub:** `github.com/TheWeirdDee/musd-reach`
    - **Mezo Buildathon 2026**
- **Voiceover:**
  > "MUSD Reach allows Mezo to keep its core savings liquidity, while empowering savers to explore the broader crypto economy. Fully functional, verified on public testnets, with transparent backing. Your savings stay on Mezo. Their reach doesn't have to."
- **Closing Card:**
  - **MUSD REACH**
  - *Save on Mezo. Reach further.*
  - *Built for the Mezo Buildathon 2026*
