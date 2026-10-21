import { describe, expect, it } from "vitest";
import { MEZO_GAS_FLOOR, gasLimitFor } from "../src/index.js";

// Regression for F-20: Mezo estimates omit the EIP-7623 calldata floor and can be near-intrinsic.
describe("gasLimitFor", () => {
  it("never sends a Mezo transaction below the floor", () => {
    expect(gasLimitFor(31611, 21_000n)).toBe(MEZO_GAS_FLOOR);
    expect(gasLimitFor(31611, 749_999n)).toBe(MEZO_GAS_FLOOR);
  });

  it("doubles large Mezo estimates", () => {
    expect(gasLimitFor(31611, 1_000_000n)).toBe(2_000_000n);
  });

  it("adds a 1.5x + 50k margin on Base Sepolia", () => {
    expect(gasLimitFor(84532, 200_000n)).toBe(350_000n);
  });
});
