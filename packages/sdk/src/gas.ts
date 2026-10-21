/** Mezo testnet EVM chain id. */
const MEZO_TESTNET = 31611;
/** Minimum gas limit for any Mezo transaction sent by Reach tooling. */
export const MEZO_GAS_FLOOR = 1_500_000n;

/**
 * Gas limit to send with, given an `eth_estimateGas` result.
 *
 * Mezo: its estimate omits the EIP-7623 calldata floor (VAA deliveries carry ~1 KB of calldata)
 * and has been seen returning near-intrinsic values against stale state. An under-gassed
 * `receiveRedeem` or `retrySettlement` reverts by design (InsufficientGasForSettlement), so a
 * low limit only wastes the fee. Gas there costs ~146 wei, so use 2x the estimate with a
 * 1.5M floor. This is the policy the v2 public run used for every Mezo transaction.
 *
 * Elsewhere: 1.5x plus 50k.
 */
export function gasLimitFor(chainId: number, estimate: bigint): bigint {
  if (chainId === MEZO_TESTNET) return estimate * 2n > MEZO_GAS_FLOOR ? estimate * 2n : MEZO_GAS_FLOOR;
  return (estimate * 15n) / 10n + 50_000n;
}
