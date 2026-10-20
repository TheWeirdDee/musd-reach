# Economic model and wrapper accounting

## Objects

| Token | Chain | Represents |
|---|---|---|
| MUSD | Mezo | Canonical stablecoin |
| sMUSD | Mezo | Native vault principal, 1:1 with MUSD; yield is tracked per address |
| wSMUSD | Mezo | Share of `ReachSavingsWrapper` net assets |
| rwSMUSD | Base Sepolia | Claim on exactly one wSMUSD base unit locked in `ReachSourceGateway` |

rwSMUSD is not pegged and carries no promised yield. Indicative value is `units × wrapper.convertToAssets(1e18) / 1e18` MUSD, read on Mezo at a stated block.

## Wrapper assets

```
A = principal + idle + pending
principal = sMUSD units deposited through the wrapper (tracked, not balanceOf)
idle      = MUSD yield claimed by the wrapper (tracked, not balanceOf)
pending   = vault.claimableYield(wrapper) + vault.balanceOf(wrapper) × (yieldIndex − supplyYieldIndex(wrapper)) / 1e18
W = wSMUSD totalSupply
```

Conversions are OpenZeppelin 5.1 ERC-4626 with decimals offset 0: `shares = floor(assets × (W + 1) / (A + 1))` and `assets = floor(shares × (A + 1) / (W + 1))`. There are no fees.

**Claim-and-hold.** Harvested yield stays as MUSD (`idle`) and is not reinvested. The wrapper is not auto-compounding.

## Ordering rules (anti-dilution)

1. Every deposit, mint, withdraw and redeem calls `_harvest()` first: best-effort `pcv.distributeMUSD()`, then `receiveYieldFromStrategy()`, then `claimYield()`. The claimed amount is measured as a real MUSD balance delta. Pending yield is therefore realised before any price is computed, so a newcomer cannot buy into yield that belongs to existing holders.
2. A failed harvest reverts MUSD entry and exit (fail closed). `redeemInKind` tolerates a failed harvest and pays pro-rata `principal` and `idle`. Unharvested yield stays with the remaining holders, which is conservative.
3. Exits pay from `idle` first, then withdraw principal from the native vault. Any extra yield the vault pays during `withdraw` is measured and kept in `idle`.

## Native sMUSD entry

`depositSavings` is priced on principal only, at the same rate as MUSD. The vault's transfer checkpoint leaves the depositor's previously accrued yield claimable in their own account. The wrapper earns on that principal only from the transfer onward. This is tested in `test_depositSavings_priorYieldStaysWithUser` and `test_depositSavingsAndIssue_keepsPriorYieldWithUser`.

## Donations and inflation

- Tokens sent directly to the wrapper are ignored, because accounting is tracked (`test_directDonations_doNotMoveSharePrice`).
- Yield donated through the vault's permissionless `receiveProtocolYield` is real yield for every sMUSD holder. With the virtual offset, a first-depositor attack costs the attacker at least what it costs the victim (`test_inflationAttack_isUnprofitable`, on a fresh vault where the wrapper holds 100% of supply: the worst case).
- Deposits that would mint zero shares revert (`ZeroShares`).

## Losses

The native vault reports principal 1:1, so wrapper NAV cannot detect impairment until a withdrawal fails. On a native outage, MUSD redemption reverts, but `redeemInKind` still delivers pro-rata sMUSD and MUSD (`test_impairedVault_musdExitFails_inKindExitWorks`). Losses are therefore socialised pro rata, not left to the last holder.

## Cross-chain conservation

```
totalLocked = totalIssued − totalReleased                              (source gateway)
rwSMUSD supply = totalMinted − totalBurned                              (destination gateway)
totalLocked = rwSMUSD supply + in-flight issues + in-flight redemptions (both chains, finalized)
```

- Issue: shares are locked before the message is published. The mint happens only after verification, once per transfer id.
- Redeem: the receipt is burned before the message is published. Release happens only after verification, once.
- There is no cancel or refund path: a signed message can always be delivered later.

## Error budget

Every conversion rounds down in favour of the wrapper. Fuzz and invariant tests assert that outputs never exceed inputs. Measured rounding loss is at most one share-price unit plus 2 wei per operation.

## Invariant tests (`test/ReachInvariants.t.sol`)

The handler drives random interleavings of wrap, yield, harvest, unwrap, in-kind unwrap, lock, deliver (out of order), receipt transfer, burn (both modes), deliver redeem, replay attempts and donations. Assertions:

1. Backing conservation, exactly.
2. Custody balance ≥ locked, and locked = issued − released.
3. Remote supply = minted − burned.
4. No replay ever succeeds.
5. Wrapper assets reconstruct from native state and tracked tokens are actually held.
6. Shares never claim more than assets.
7. No value is created: paid out plus remaining ≤ deposited plus yield.

The latest local run: 128 runs × 64 depth = 8 192 calls, 0 reverts, all invariants hold.

## Testnet yield

`pcv()` is zero on testnet, so yield exists only if someone distributes it. The product works with zero yield indefinitely (`test_zeroYield_priceStaysExactlyOne_noDivisionIssues`). The UI never shows APY or projections.

## Settlement of MUSD-mode redemptions (v2)

A REDEEM message names the payout asset. On delivery, the shares leave `totalLocked`, because they no longer back a remote receipt. If the MUSD payout can't complete, they move to `totalPendingSettlement`, held in custody and earmarked for the recipient. The custody invariant becomes `wSMUSD held by the gateway ≥ totalLocked + totalPendingSettlement`, asserted by `invariant_pendingSettlementsFullyBacked` and checked by `reconcile()`.

A pending settlement is priced when it settles, not when it was delivered, so the recipient keeps exposure to the wrapper's NAV until then. `retrySettlement` keeps the burner's minimum. Only the recipient can lower it or take shares instead.
