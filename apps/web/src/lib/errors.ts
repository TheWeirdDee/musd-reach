import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError, decodeErrorResult, parseAbi, type Hex } from "viem";

/**
 * Every sentence a person reads when a transaction fails comes from this file, so the wording stays
 * in one place. Errors are matched by name across every contract Reach touches (wrapper, gateways,
 * NAV oracle, route kit, Morpho Blue, Morpho Vault V2), including errors raised by a nested call,
 * such as the oracle refusing a stale price during a Morpho borrow.
 */

/** Custom errors of the Reach contracts (packages/contracts/src), decodable from raw revert data. */
const REACH_ERRORS = parseAbi([
  "error AlreadyBound()",
  "error AlreadyClaimed()",
  "error AlreadyConsumed(bytes32 id)",
  "error BadProtocol()",
  "error BadVersion()",
  "error ClaimsPaused()",
  "error DailyLimitReached()",
  "error DepositsArePaused()",
  "error DomainMismatch()",
  "error HarvestOutOfGas()",
  "error IncorrectMessageFee(uint256 expected, uint256 provided)",
  "error InsufficientGasForSettlement()",
  "error InsufficientPrincipal(uint256 requested, uint256 available)",
  "error InvalidConfig()",
  "error InvalidMode()",
  "error InvalidSetting()",
  "error InvalidVaa(string reason)",
  "error IssuanceIsPaused()",
  "error KitEmpty()",
  "error NavStale(uint256 age, uint256 maxAge)",
  "error NavUnavailable()",
  "error NoPendingSettlement()",
  "error NotBinder()",
  "error NotGuardian()",
  "error NotPendingGuardian()",
  "error NotRecipient()",
  "error OnlyGateway()",
  "error OnlySelf()",
  "error PeerNotSet()",
  "error SlippageExceeded(uint256 shares, uint256 minShares)",
  "error UnexpectedVaultDelta(uint256 expected, uint256 actual)",
  "error UnknownEmitter(bytes32 emitter)",
  "error UnknownEmitterChain(uint16 chainId)",
  "error VaultUnderlyingMismatch()",
  "error WrongChain()",
  "error WrongDirection()",
  "error ZeroAddress()",
  "error ZeroAmount()",
  "error ZeroAssets()",
  "error ZeroShares()",
  "error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed)",
  "error ERC20InsufficientAllowance(address spender, uint256 allowance, uint256 needed)",
  "error ERC4626ExceededMaxDeposit(address receiver, uint256 assets, uint256 max)",
  "error ERC4626ExceededMaxWithdraw(address owner, uint256 assets, uint256 max)",
  "error ERC4626ExceededMaxRedeem(address owner, uint256 shares, uint256 max)",
  "error OwnableUnauthorizedAccount(address account)",
  "error EnforcedPause()",
  "error NotRelayer()",
  "error NativeTransferFailed()",
  // Morpho Vault V2
  "error Unauthorized()",
  "error TimelockNotExpired()",
  "error DataNotTimelocked()",
  "error FeeTooHigh()",
  "error AbsoluteCapExceeded()",
  "error RelativeCapExceeded()",
]);

const BY_NAME: Record<string, string> = {
  // Wallet and token
  ERC20InsufficientBalance: "You don't have enough of this token for that amount.",
  ERC20InsufficientAllowance: "No approval covers this amount. Only the owner of these tokens can approve it; if that is you, approve again and retry.",
  // Savings wrapper
  DepositsArePaused: "Saving new MUSD is paused by the guardian right now. Taking savings out still works.",
  ERC4626ExceededMaxDeposit: "Saving new MUSD is paused by the guardian right now. Taking savings out still works.",
  ERC4626ExceededMaxWithdraw: "That is more than you can take out of this vault right now. Try a smaller amount.",
  ERC4626ExceededMaxRedeem: "That is more than you can take out of this vault right now. Try a smaller amount.",
  SlippageExceeded: "The savings value moved a little since your quote. Refresh and try again.",
  ZeroShares: "That amount is too small to save. Enter a larger amount.",
  ZeroAssets: "That amount is too small to pay out. Enter a larger amount.",
  ZeroAmount: "Enter an amount above zero.",
  InsufficientPrincipal: "The savings vault cannot pay that much MUSD right now. Try less, or keep the savings shares instead.",
  HarvestOutOfGas: "Not enough gas was attached to collect the savings yield. Try again; the app sets the limit for you.",
  UnexpectedVaultDelta: "Mezo's savings vault returned an unexpected amount, so nothing was done. Your funds are unchanged.",
  // Gateways and Wormhole messages
  IssuanceIsPaused: "Sending savings to Base is paused by the guardian right now. Bringing savings home still works.",
  IncorrectMessageFee: "The Wormhole fee changed. Refresh the page and try again.",
  AlreadyConsumed: "This message was already delivered. Nothing more to do.",
  InvalidVaa: "Wormhole's signature on this message did not check out, so it was refused.",
  UnknownEmitter: "This message did not come from the Reach gateway, so it was refused.",
  UnknownEmitterChain: "This message came from an unexpected chain, so it was refused.",
  WrongChain: "This message is meant for the other chain. Deliver it there.",
  WrongDirection: "This message goes the other way. Open it from its tracker.",
  PeerNotSet: "The Reach gateways are not connected yet.",
  NoPendingSettlement: "There is nothing waiting to be paid out for this transfer.",
  NotRecipient: "Only the wallet that receives this transfer can do that.",
  InsufficientGasForSettlement: "Not enough gas was attached to finish paying out. Try again; the app sets the limit for you.",
  BadProtocol: "This message is not a Reach message.",
  BadVersion: "This message uses an unsupported version.",
  DomainMismatch: "This message belongs to a different deployment.",
  // NAV oracle (raised inside Morpho when it prices collateral)
  NavStale: "The savings price from Mezo is older than 72 hours, so new loans are paused until the next update arrives. Repaying still works.",
  NavUnavailable: "No savings price has arrived from Mezo yet, so loans can't open. Repaying still works.",
  // Route kit
  AlreadyClaimed: "This wallet already claimed its route kit. One per wallet.",
  DailyLimitReached: "Today's route kits are all claimed. More open at 00:00 UTC.",
  ClaimsPaused: "Route kits are paused right now. Try again later.",
  KitEmpty: "The route kit is out of MUSD right now. Try again later.",
  EnforcedPause: "This is paused right now. Try again later.",
  NotRelayer: "Only Reach's relayer can send route kits. Use the button on the Try it page instead.",
  NativeTransferFailed: "Your wallet could not receive the gas money. Try a regular wallet address.",
  // Morpho Vault V2
  Unauthorized: "This wallet isn't allowed to do that. Only the vault's owner or curator can.",
  TimelockNotExpired: "This change is still in its waiting period. Try again once the timelock ends.",
  DataNotTimelocked: "This change has to be announced first and wait out its timelock.",
  FeeTooHigh: "That fee is above the vault's maximum.",
  AbsoluteCapExceeded: "The vault has reached its limit for this market. Try a smaller amount.",
  RelativeCapExceeded: "The vault has reached its limit for this market. Try a smaller amount.",
  // Admin-only paths a visitor should never reach
  NotGuardian: "Only the guardian can do that.",
  NotPendingGuardian: "Only the incoming guardian can do that.",
  NotBinder: "Only the deployer can do that.",
  OnlyGateway: "Only the Reach gateway can do that.",
  OnlySelf: "That can't be called directly.",
  OwnableUnauthorizedAccount: "Only the owner can do that.",
  AlreadyBound: "The gateways are already connected.",
  InvalidConfig: "That setting is not allowed.",
  InvalidSetting: "That setting is not allowed.",
  InvalidMode: "That mode is not allowed.",
  ZeroAddress: "An address is missing.",
  VaultUnderlyingMismatch: "The savings vault does not hold MUSD.",
};

/** Morpho Blue and Morpho Vault V2 revert with short text; matched case-insensitively. */
const BY_TEXT: [RegExp, string][] = [
  [/insufficient collateral/i, "That loan is bigger than your collateral allows. Borrow less, or add more rwSMUSD first."],
  [/insufficient liquidity/i, "The market doesn't have that much to lend right now. Try a smaller amount."],
  [/position is healthy/i, "This loan is healthy, so it can't be liquidated."],
  [/inconsistent input/i, "Enter either an amount or shares, not both."],
  [/zero assets/i, "Enter an amount above zero."],
  [/market not created/i, "This market doesn't exist on this network."],
  [/unauthorized/i, "This wallet isn't allowed to do that."],
  [/transferFrom (reverted|returned false)/i, "The token transfer failed. Check your balance and approval, then try again."],
  [/transfer (reverted|returned false)/i, "The token transfer failed. Try again."],
  [/max uint128 exceeded/i, "That amount is too large."],
];

/** Network and node trouble, as opposed to a contract refusing. */
const NETWORK: [RegExp, string][] = [
  [/insufficient funds/i, "Not enough gas on this network to pay for the transaction. Top up and try again."],
  [/header not found|timeout|timed out|fetch failed|failed to fetch|ECONNRESET|503|502|rate limit|429/i, "The network is busy or a node is behind. Wait a few seconds and try again; nothing was sent."],
  [/nonce too low|replacement transaction underpriced|already known/i, "Your wallet has a transaction still pending. Wait for it to finish, then try again."],
  [/chain mismatch|does not match the target chain|switch chain|unrecognized chain/i, "Your wallet is on a different network. Switch networks when asked, then try again."],
];

/** "SomeErrorName" → "Some error name", for anything this file does not know yet. */
const humanize = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase().replace(/^./, (c) => c.toUpperCase());

function rawRevertData(e: BaseError): Hex | null {
  let data: Hex | null = null;
  e.walk((x) => {
    const d = (x as { data?: unknown }).data;
    if (typeof d === "string" && /^0x[0-9a-f]{8}/i.test(d)) data = d as Hex;
    else if (d && typeof d === "object" && typeof (d as { data?: unknown }).data === "string") data = (d as { data: Hex }).data;
    return false;
  });
  return data;
}

/** Human-readable reason for a failed or refused transaction; never hides that something failed. */
export function explainError(e: unknown): { rejected: boolean; message: string } {
  const text = e instanceof Error ? `${e.message} ${(e as { details?: string }).details ?? ""}` : String(e);
  if (e instanceof BaseError) {
    if (e.walk((x) => x instanceof UserRejectedRequestError) || /user rejected|user denied|rejected the request/i.test(text)) {
      return { rejected: true, message: "You cancelled in your wallet. Nothing was sent." };
    }
    const rev = e.walk((x) => x instanceof ContractFunctionRevertedError);
    if (rev instanceof ContractFunctionRevertedError) {
      let name = rev.data?.errorName;
      // A nested contract's error (for example the oracle inside a Morpho borrow) is not in the
      // called contract's ABI, so decode the raw data against every error Reach knows.
      if (!name || name === "Error") {
        const raw = rev.raw ?? rawRevertData(e);
        if (raw) {
          try {
            name = decodeErrorResult({ abi: REACH_ERRORS, data: raw }).errorName;
          } catch {}
        }
      }
      if (name && BY_NAME[name]) return { rejected: false, message: BY_NAME[name] };
      if (name === "Panic" || /panic|underflow|overflow/i.test(rev.reason ?? "")) return { rejected: false, message: "The numbers don't add up: this is more than this wallet holds or is allowed to move." };
      const reason = rev.reason ?? "";
      for (const [re, msg] of BY_TEXT) if (re.test(reason) || re.test(text)) return { rejected: false, message: msg };
      return { rejected: false, message: name && name !== "Error" ? `The contract refused: ${humanize(name)}.` : reason ? `The contract refused: ${reason}.` : "The contract refused this transaction. Nothing was sent." };
    }
    for (const [re, msg] of BY_TEXT) if (re.test(text)) return { rejected: false, message: msg };
    for (const [re, msg] of NETWORK) if (re.test(text)) return { rejected: false, message: msg };
    return { rejected: false, message: e.shortMessage };
  }
  for (const [re, msg] of NETWORK) if (re.test(text)) return { rejected: false, message: msg };
  return { rejected: false, message: e instanceof Error ? e.message.split("\n")[0]! : String(e) };
}

/** The contract-level reason by name (decoded across every known contract), or the revert text, for people who want the exact error. */
export function errorCode(e: unknown): string | undefined {
  if (!(e instanceof BaseError)) return undefined;
  const rev = e.walk((x) => x instanceof ContractFunctionRevertedError);
  if (!(rev instanceof ContractFunctionRevertedError)) return undefined;
  let name = rev.data?.errorName;
  if (!name || name === "Error") {
    const raw = rev.raw ?? rawRevertData(e);
    if (raw) {
      try {
        name = decodeErrorResult({ abi: REACH_ERRORS, data: raw }).errorName;
      } catch {}
    }
  }
  if (name && name !== "Error") return name === "Panic" ? `Panic (${rev.reason ?? "arithmetic"})` : name;
  return rev.reason ?? rev.signature ?? undefined;
}
