/** Release hold: never change this to cleared without a normal, security-enabled MetaMask retest. */
export const walletSafety = {
  status: "under-investigation",
  reportedAt: "2026-10-25",
  reason: "A malicious-site warning was reported during MetaMask connection. Its classification has not been cleared.",
} as const;

// Keyless scripted providers only, on a local development build. No extension protection is changed.
export const scriptedWalletTests = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_E2E_WALLET_TESTS === "keyless";
export const walletSafetyHold = !scriptedWalletTests;
