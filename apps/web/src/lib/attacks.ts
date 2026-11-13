import { parseAbi, toHex, type Abi, type Address, type Hex } from "viem";
import { reachConfig, deployment, BASE_ID, MEZO_ID } from "./reach";
import { markets, musdMarket, testerKits } from "./markets";
import { WORMHOLESCAN_API } from "./csp";

/**
 * "Attack the bridge": real attacks against the live testnet contracts, simulated with eth_call so
 * nothing is ever sent. Each one names the rule that should stop it. A run passes only when the
 * contract refuses; an attack that went through would be shown as a failure, never hidden.
 */

/** An address with no rights anywhere: the "stranger" the attacks run as by default. */
export const STRANGER: Address = "0x000000000000000000000000000000000000dEaD";

export type AttackCall = { chainId: number; address: Address; abi: Abi; functionName: string; args: readonly unknown[] };
/** Where on the route an attack hits: the savings on Mezo, the Wormhole message, or Base. */
export type Part = "mezo" | "message" | "base";
export const PARTS: { id: Part; name: string; where: string; claim: string }[] = [
  { id: "mezo", name: "The savings on Mezo", where: "Mezo testnet", claim: "Locked savings move only on a signed return message, and only the guardian can pause new transfers." },
  { id: "message", name: "The Wormhole message", where: "Mezo → Base", claim: "A message counts only with a valid guardian signature over every byte, and only once." },
  { id: "base", name: "The receipt and markets on Base", where: "Base Sepolia", claim: "Receipts are minted only by the gateway, loans need collateral, and lenders' money moves only on their say." },
];

export type Attack = {
  id: string;
  part: Part;
  title: string;
  attempt: string;
  rule: string;
  /** Builds the exact call; may fetch a real signed message first. */
  build: (from: Address) => Promise<AttackCall | null>;
};

const receiptAbi = parseAbi(["function mint(address to, uint256 amount)"]);
const destAbi = parseAbi(["function receiveIssue(bytes encodedVaa) returns (bytes32)", "function receiveNav(bytes encodedVaa) returns (bytes32)"]);
const sourceAbi = parseAbi(["function setIssuancePaused(bool paused)"]);
const wrapperAbi = parseAbi(["function redeem(uint256 shares, address receiver, address owner) returns (uint256)"]);
const morphoAbi = parseAbi(["function borrow((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, uint256 assets, uint256 shares, address onBehalf, address receiver) returns (uint256, uint256)"]);
const vaultAbi = parseAbi(["function withdraw(uint256 assets, address receiver, address onBehalf) returns (uint256)", "function setCurator(address newCurator)"]);
const kitAbi = parseAbi(["function claimFor(address to)"]);

/** A real, already-delivered ISSUE message from the Reach source gateway, fetched from Wormholescan. */
async function realVaa(seq = 0): Promise<Hex | null> {
  if (!deployment?.sourceGateway) return null;
  const emitter = deployment.sourceGateway.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  const r = await fetch(`${WORMHOLESCAN_API}/api/v1/vaas/50/${emitter}/${seq}`, { signal: AbortSignal.timeout(20_000) });
  if (!r.ok) return null;
  const j = (await r.json()) as { data?: { vaa?: string } };
  if (!j.data?.vaa) return null;
  const bytes = Uint8Array.from(atob(j.data.vaa), (c) => c.charCodeAt(0));
  return toHex(bytes);
}

/** The same message with one byte of its payload changed, as if someone edited the amount. */
function tamper(vaa: Hex): Hex {
  const b = Uint8Array.from((vaa.slice(2).match(/../g) ?? []).map((h) => parseInt(h, 16)));
  b[b.length - 40] ^= 0x01;
  return toHex(b);
}

const usdcParams = () => (markets ? { loanToken: markets.loanToken, collateralToken: markets.collateralToken, oracle: markets.oracle, irm: markets.irm, lltv: BigInt(markets.lltv) } : null);

export const ATTACKS: Attack[] = [
  {
    id: "mint",
    part: "base",
    title: "Print rwSMUSD out of thin air",
    attempt: "Call the receipt token's mint function directly and give yourself 1,000 rwSMUSD, with no savings behind it.",
    rule: "Only the Reach gateway on Base can mint, and only after a Wormhole-signed message from Mezo.",
    build: async () => (deployment?.receipt ? { chainId: BASE_ID, address: deployment.receipt as Address, abi: receiptAbi, functionName: "mint", args: [STRANGER, 1000n * 10n ** 18n] } : null),
  },
  {
    id: "forge",
    part: "message",
    title: "Fake a Wormhole message",
    attempt: "Take a real signed message from Mezo, change one byte of its payload, and deliver it on Base to mint receipts.",
    rule: "Wormhole's guardian signature covers every byte. One changed byte and the signature no longer verifies.",
    build: async () => {
      const v = await realVaa(0);
      return v && deployment?.destinationGateway ? { chainId: BASE_ID, address: deployment.destinationGateway as Address, abi: destAbi, functionName: "receiveIssue", args: [tamper(v)] } : null;
    },
  },
  {
    id: "replay",
    part: "message",
    title: "Deliver the same message twice",
    attempt: "Re-deliver a real, already-delivered message to mint the same receipts a second time.",
    rule: "Every message has a transfer id that can be used once. A second delivery is refused.",
    build: async () => {
      const v = await realVaa(0);
      return v && deployment?.destinationGateway ? { chainId: BASE_ID, address: deployment.destinationGateway as Address, abi: destAbi, functionName: "receiveIssue", args: [v] } : null;
    },
  },
  {
    id: "nav",
    part: "message",
    title: "Push a fake savings price",
    attempt: "Send the oracle an edited price message so your collateral looks worth more and you can borrow more.",
    rule: "The price arrives only as a Wormhole-signed message from Mezo. An edited one fails the signature check.",
    build: async () => {
      const v = await realVaa(0);
      return v && deployment?.destinationGateway ? { chainId: BASE_ID, address: deployment.destinationGateway as Address, abi: destAbi, functionName: "receiveNav", args: [tamper(v)] } : null;
    },
  },
  {
    id: "steal-savings",
    part: "mezo",
    title: "Take the locked savings on Mezo",
    attempt: "Redeem the savings shares locked by the Reach gateway straight to your own wallet.",
    rule: "Shares can only be redeemed by their owner. The gateway's shares move only on a signed return message.",
    build: async () => (deployment?.wrapper && deployment.sourceGateway ? { chainId: MEZO_ID, address: deployment.wrapper as Address, abi: wrapperAbi, functionName: "redeem", args: [10n ** 18n, STRANGER, deployment.sourceGateway as Address] } : null),
  },
  {
    id: "no-collateral",
    part: "base",
    title: "Borrow with no collateral",
    attempt: "Borrow 10 USDC from the Reach market without posting any rwSMUSD.",
    rule: "Morpho checks every borrow against your collateral, priced by the Reach oracle.",
    build: async (from) => {
      const p = usdcParams();
      return p && markets ? { chainId: BASE_ID, address: markets.morpho, abi: morphoAbi, functionName: "borrow", args: [p, 10_000_000n, 0n, from, from] } : null;
    },
  },
  {
    id: "drain-vault",
    part: "base",
    title: "Withdraw other lenders' money",
    attempt: "Withdraw 1 MUSD from the Reach MUSD Vault on behalf of another lender.",
    rule: "A vault only pays out a lender's own shares, or shares they approved you to spend.",
    build: async () => (musdMarket ? { chainId: BASE_ID, address: musdMarket.vault, abi: vaultAbi, functionName: "withdraw", args: [10n ** 18n, STRANGER, musdMarket.curator] } : null),
  },
  {
    id: "curator",
    part: "base",
    title: "Take over the vault",
    attempt: "Make yourself curator of the Reach MUSD Vault to redirect where it lends.",
    rule: "Only the vault owner can change the curator, and curator changes go through a timelock.",
    build: async () => (musdMarket ? { chainId: BASE_ID, address: musdMarket.vault, abi: vaultAbi, functionName: "setCurator", args: [STRANGER] } : null),
  },
  {
    id: "pause",
    part: "mezo",
    title: "Freeze everyone's transfers",
    attempt: "Pause new transfers to Base on the Mezo gateway.",
    rule: "Only the guardian can pause, and pausing never blocks bringing savings home.",
    build: async () => (deployment?.sourceGateway ? { chainId: MEZO_ID, address: deployment.sourceGateway as Address, abi: sourceAbi, functionName: "setIssuancePaused", args: [true] } : null),
  },
  {
    id: "kit",
    part: "mezo",
    title: "Empty the route kits",
    attempt: "Call the route-kit contract yourself and send kits to your own addresses, over and over.",
    rule: "Only Reach's relayer can send kits, one per address, with a daily limit.",
    build: async () => (testerKits.mezo ? { chainId: MEZO_ID, address: testerKits.mezo.testerKit, abi: kitAbi, functionName: "claimFor", args: [STRANGER] } : null),
  },
];

export const attackRpc = (chainId: number) => (chainId === MEZO_ID ? reachConfig.mezo : reachConfig.base);
