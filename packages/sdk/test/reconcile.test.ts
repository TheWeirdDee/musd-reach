import { describe, expect, it } from "vitest";
import type { PublicClient } from "viem";
import { buildConfig, reconcile } from "../src/index.js";

// Regression for F-13: the Base snapshot must default to `latest`, not `finalized`. The RPC
// `finalized` head can lag blocks whose burns the guardians already attested and Mezo already
// released, which made an honest system report a false MISMATCH.
describe("reconcile snapshot ordering", () => {
  it("snapshots Base at latest by default, before reading Mezo", async () => {
    const calls: string[] = [];
    const base = {
      getBlock: async ({ blockTag }: { blockTag: string }) => {
        calls.push(`base:getBlock:${blockTag}`);
        return { number: 1n }; // below the deploy block -> early AWAITING_FINALITY return
      },
    } as unknown as PublicClient;
    const mezo = {
      getBlockNumber: async () => {
        calls.push("mezo:getBlockNumber");
        return 100n;
      },
    } as unknown as PublicClient;
    const cfg = buildConfig({
      deployments: { wrapper: "0x" + "1".repeat(40), sourceGateway: "0x" + "2".repeat(40), destinationGateway: "0x" + "3".repeat(40), receipt: "0x" + "4".repeat(40), destinationDeployBlock: 10 },
    });
    const r = await reconcile({ base, mezo }, cfg);
    expect(calls).toEqual(["base:getBlock:latest", "mezo:getBlockNumber"]);
    expect(r.status).toBe("AWAITING_FINALITY");
  });
});
