import { settlementModel } from "./reach";

/** Copy describing what happens to a MUSD-mode redemption, for the deployed contract version. */
export const settlementCopy =
  settlementModel === "pending-v2"
    ? {
        modeHint: "Wrapper redeems at NAV. If the vault can't pay your minimum, it waits as a pending settlement; only you can lower the minimum or take shares.",
        minHint: "Below this, the redemption waits as a pending settlement",
        deliveryLabel: "MUSD (pending settlement if it can't settle)",
        howItWorks:
          "Mezo verifies the return message and releases exactly n wSMUSD, once. If MUSD was requested, the wrapper redeems at current NAV. If the native vault can't pay your minimum, the shares wait in custody as a pending settlement that anyone can retry; only the recipient can accept a lower minimum or take shares instead.",
        faq:
          "The redemption becomes a pending settlement: your shares stay in custody, earmarked for you. Anyone can retry it once the vault can pay; only you can accept a lower minimum or take the wSMUSD shares instead. A relayer can never switch your payout asset, and a delivery that runs out of gas reverts so it can be retried.",
        risk:
          "Redeeming to MUSD depends on the native vault paying out. If it can't, or would pay below your minimum, the redemption waits as a pending settlement until it can be retried, or until you choose a lower minimum or shares.",
      }
    : {
        modeHint: "Wrapper redeems at NAV. In this deployment, any settlement failure pays wSMUSD shares instead (known issue).",
        minHint: "Below this, shares are delivered instead (this deployment)",
        deliveryLabel: "MUSD (falls back to shares in this deployment)",
        howItWorks:
          "Mezo verifies the return message and releases exactly n wSMUSD, once. If MUSD was requested, the wrapper redeems at current NAV; in the current deployment a failed settlement delivers the shares instead.",
        faq:
          "In the current testnet deployment, a failed MUSD settlement delivers the wSMUSD shares instead, which stay redeemable in kind. A known issue: a relayer can force that fallback with carefully chosen gas when native withdrawals are expensive. A fixed version (pending settlements the recipient controls) is implemented and tested but not yet deployed.",
        risk:
          "Redeeming to MUSD depends on the native vault paying out. In the current deployment, if it can't (or a relayer starves the settlement of gas), you receive wSMUSD shares instead. This is fixed in the next version, which is not yet deployed.",
      };
