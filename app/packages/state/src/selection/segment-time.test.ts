import { describe, expect, it } from "vitest";
import { segmentTimeNs } from "./segment-time";

const range = (timebase: string, start: string, end: string) => ({
  timebase,
  start,
  end,
  streams: [],
  provenance: [],
});

describe("segmentTimeNs", () => {
  it("rebases epoch nanoseconds before converting to numbers", () => {
    expect(
      segmentTimeNs(
        range("timestamp-ns", "1700000000000000001", "1700000000000000009"),
        {
          originNs: 1700000000000000000n,
        },
      ),
    ).toEqual({ startNs: 1n, endNs: 9n });
    expect(segmentTimeNs(range("timestamp-ns", "10", "20"))).toBeNull();
  });
  it("converts zero-based, half-open frame bounds", () => {
    expect(
      segmentTimeNs(range("sequence", "30", "60"), { frameRate: 30 }),
    ).toEqual({ startNs: 1000000000n, endNs: 2000000000n });
    expect(segmentTimeNs(range("sequence", "30", "60"))).toBeNull();
  });
  it("keeps duration bounds independent of the episode epoch", () => {
    expect(
      segmentTimeNs(range("duration-ns", "100", "200"), { originNs: 999n }),
    ).toEqual({ startNs: 100n, endNs: 200n });
  });
});
