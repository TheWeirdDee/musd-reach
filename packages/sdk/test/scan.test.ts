import { beforeEach, describe, expect, it } from "vitest";
import { clearScanCache, scanIncremental } from "../src/index.js";

// Reconciliation used to rescan Base from the deploy block in 2,000-block windows on every refresh
// (~380 requests two days after deployment, growing daily). Repeat scans must only read new blocks.
type Log = { blockNumber: bigint | null; id: string };
function chain(logs: Log[]) {
  const calls: [bigint, bigint][] = [];
  const fetchRange = async (a: bigint, b: bigint) => {
    calls.push([a, b]);
    return logs.filter((l) => l.blockNumber! >= a && l.blockNumber! <= b);
  };
  return { calls, fetchRange };
}
const opts = { step: 49_999n, reorgMargin: 2_000n };

describe("scanIncremental", () => {
  beforeEach(() => clearScanCache());

  it("covers a large range in 50k windows, then only reads new blocks", async () => {
    const logs: Log[] = [{ blockNumber: 1_000n, id: "a" }, { blockNumber: 700_000n, id: "b" }];
    const c = chain(logs);
    const first = await scanIncremental("k", c.fetchRange, 1_000n, 763_651n, opts);
    expect(first.map((l) => l.id)).toEqual(["a", "b"]);
    expect(c.calls.length).toBe(16);

    c.calls.length = 0;
    logs.push({ blockNumber: 765_000n, id: "c" });
    const second = await scanIncremental("k", c.fetchRange, 1_000n, 765_500n, opts);
    expect(second.map((l) => l.id)).toEqual(["a", "b", "c"]);
    expect(c.calls).toEqual([[761_652n, 765_500n]]); // only the reorg margin plus new blocks
  });

  it("never caches logs inside the reorg margin, so a reorged log disappears", async () => {
    const logs: Log[] = [{ blockNumber: 99_500n, id: "tail" }];
    const c = chain(logs);
    expect((await scanIncremental("k", c.fetchRange, 0n, 100_000n, opts)).map((l) => l.id)).toEqual(["tail"]);
    logs.length = 0; // the block holding "tail" was reorged out
    expect(await scanIncremental("k", c.fetchRange, 0n, 100_100n, opts)).toEqual([]);
  });

  it("rescans from the start for an earlier head or a different start block", async () => {
    const c = chain([{ blockNumber: 10n, id: "a" }]);
    await scanIncremental("k", c.fetchRange, 0n, 200_000n, opts);
    c.calls.length = 0;
    await scanIncremental("k", c.fetchRange, 0n, 100_000n, opts);
    expect(c.calls[0]).toEqual([0n, 49_999n]);
    c.calls.length = 0;
    await scanIncremental("k", c.fetchRange, 5n, 300_000n, opts);
    expect(c.calls[0]).toEqual([5n, 50_004n]);
  });
});
