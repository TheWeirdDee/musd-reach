import { describe, expect, it } from "vitest";
import { keccak256 } from "viem";
import { PROTOCOL_ID, encodeReachMessage, decodeReachMessage, transferIdOf, parseVaa, type ReachMessage } from "../src/messages.js";
import { formatAmount, parseAmount } from "../src/format.js";

// Expected values computed with Foundry `cast` against the Solidity encoding:
//   cast keccak "MUSD_REACH"
//   cast keccak $(cast abi-encode "f(bytes32,uint8,uint8,uint256,uint16,address,uint64)" <pid> 1 1 31611 50 0x..A1 7)
//   cast abi-encode "f((bytes32,uint8,...,uint64,uint64))" "(...)" | cast keccak
const sample: ReachMessage = {
  protocolId: PROTOCOL_ID,
  version: 1,
  direction: 1,
  originEvmChainId: 31611n,
  targetEvmChainId: 84532n,
  originWormholeChainId: 50,
  targetWormholeChainId: 10004,
  originGateway: "0x00000000000000000000000000000000000000a1",
  targetGateway: "0x00000000000000000000000000000000000000b2",
  wrapper: "0x00000000000000000000000000000000000000c3",
  receipt: "0x00000000000000000000000000000000000000d4",
  nonce: 7n,
  shares: 10n ** 18n,
  sender: "0x00000000000000000000000000000000000000e5",
  recipient: "0x00000000000000000000000000000000000000f6",
  redeemMode: 0,
  minAssets: 0n,
  navAssets: 11n * 10n ** 17n,
  navSupply: 10n ** 18n,
  navTimestamp: 1760000000n,
  navBlock: 16261469n,
};

describe("ReachMessages codec matches Solidity", () => {
  it("protocol id", () => {
    expect(PROTOCOL_ID).toBe("0x51306ff766b2383f1762963c80bdb03fe69ba28eef1ef428eeb41a0168b0a8db");
  });
  it("payload encoding", () => {
    expect(keccak256(encodeReachMessage(sample))).toBe("0x67029e6cc8cf85bcd6c2523ff1ebc37e424c1309a8b16af0ed0539b1b0e68c9c");
  });
  it("round trips", () => {
    const d = decodeReachMessage(encodeReachMessage(sample));
    expect(d.shares).toBe(sample.shares);
    expect(d.recipient.toLowerCase()).toBe(sample.recipient.toLowerCase());
    expect(d.navBlock).toBe(sample.navBlock);
  });
  it("transfer id", () => {
    expect(transferIdOf(sample)).toBe("0xe8df1bce84a0bd90258a93d33f3719f8ff24532c906673b693bcc27206703edb");
  });
});

describe("VAA parsing", () => {
  // Real testnet VAA (Mezo chain 50, emitter 0x125b…4b64, sequence 1) from Wormholescan.
  const b64 =
    "AQAAAAABAKhNLDCJ7e40TvBAZpbIdemh2IC5tE5yDDNY84Q1LGdPLQOb0UMSAYlJrqBrCDunCrJo+hfxP3anczEVpFBwOcoAatQqmgAAAAAAMgAAAAAAAAAAAAAAABJbDb1udZ6iWLIVIS7OS0IDzUtkAAAAAAAAAAEBAgIAAAAAAAAAAicUAAAAAAAAAAAAAAAANLdPxlNzY9WTS3BagGrGa9gozfsAAAAAAAAAAAAAAAAIqvas3KOBiUJjOMysEWLs9AV+2gAAAAAAAAAAAAAAAEIAAAAAAAAAAAAAAAAAAAAAAAAGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAONfqTGgAA=";
  it("parses header and body like Core.parseVM", () => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const v = parseVaa(bytes);
    expect(v.version).toBe(1);
    expect(v.guardianSetIndex).toBe(0);
    expect(v.signatures).toHaveLength(1);
    expect(v.emitterChainId).toBe(50);
    expect(v.emitterAddress).toBe("0x000000000000000000000000125b0dbd6e759ea258b215212ece4b4203cd4b64");
    expect(v.sequence).toBe(1n);
    expect(v.consistencyLevel).toBe(1);
    // digest reported by Wormholescan for this VAA
    expect(v.digest).toBe("0xfacef33a56a1791f05179a9d756069b656567ee1b8e71d3e8e71e31e8194625a");
  });
});

describe("amount helpers use exact integer math", () => {
  it("parses and formats without floating point", () => {
    expect(parseAmount("1234.5")).toBe(1234500000000000000000n);
    expect(parseAmount("0.000000000000000001")).toBe(1n);
    expect(() => parseAmount("1.0000000000000000001")).toThrow();
    expect(() => parseAmount("-1")).toThrow();
    expect(formatAmount(1234567890000000000000n)).toBe("1,234.5678");
    expect(formatAmount(19999n, 4, 2)).toBe("1.99");
  });
});
