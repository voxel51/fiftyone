import { describe, expect, it } from "vitest";
import { MCAP_ACTIVE_TIMELINE, type McapTimelineRange } from "../types";
import { createMcapTimelineIndex } from "./mcap-timeline-index";

function timelineRange(endTimeNs: bigint, startTimeNs = 0n): McapTimelineRange {
  return {
    activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
    endTimeNs,
    startTimeNs,
  };
}

describe("McapTimelineIndex", () => {
  it("represents the default 30 Hz tick grid without materializing it", () => {
    const index = createMcapTimelineIndex(timelineRange(100_000_000n));

    expect(index.stepNs).toBe(33_333_333n);
    expect(index.tickCount).toBe(4);
    expect([0, 1, 2, 3].map((i) => index.tickAt(i))).toEqual([
      0n,
      33_333_333n,
      66_666_666n,
      99_999_999n,
    ]);
    expect(index.tickAt(4)).toBeUndefined();
  });

  it("keeps long recordings addressable past the old 20k tick cap", () => {
    const index = createMcapTimelineIndex(timelineRange(7_200_000_000_000n));
    const nearest = index.nearestTick(7_199);

    expect(index.tickCount).toBeGreaterThan(20_000);
    expect(index.tickCount).toBe(216_001);
    expect(nearest).toBeDefined();
    expect(nearest).toBeGreaterThan(7_198_900_000_000n);
    expect(nearest).toBeGreaterThan(20_000n * index.stepNs);
  });

  it("maps between times, tick indexes, and exact grid ticks", () => {
    const index = createMcapTimelineIndex(
      timelineRange(1_100_000_000n, 1_000_000_000n),
    );

    expect(index.tickAt(-1)).toBeUndefined();
    expect(index.tickAt(0)).toBe(1_000_000_000n);
    expect(index.tickAt(1)).toBe(1_033_333_333n);
    expect(index.tickAt(index.tickCount)).toBeUndefined();
    expect(index.indexAtOrAfter(999_999_999n)).toBe(0);
    expect(index.indexAtOrAfter(1_000_000_000n)).toBe(0);
    expect(index.indexAtOrAfter(1_000_000_001n)).toBe(1);
    expect(index.indexAtOrAfter(1_033_333_333n)).toBe(1);
    expect(index.indexAtOrAfter(1_200_000_000n)).toBe(index.tickCount);
    expect(index.indexOfTick(1_033_333_333n)).toBe(1);
    expect(index.indexOfTick(1_000_000_001n)).toBeUndefined();
    expect(index.indexOfTick(999_999_999n)).toBeUndefined();
    expect(index.nsToSec(1_500_000_000n)).toBe(0.5);
    expect(index.secToNs(0.5)).toBe(1_500_000_000n);
  });

  it("clamps nearest-tick lookup before the first tick and after the last", () => {
    const index = createMcapTimelineIndex(timelineRange(100_000_000n));

    expect(index.nearestTick(-1)).toBe(0n);
    expect(index.nearestTick(10)).toBe(99_999_999n);
  });

  it("rejects ranges whose end precedes their start", () => {
    expect(() => createMcapTimelineIndex(timelineRange(1n, 2n))).toThrow(
      "MCAP timeline range end cannot be before start",
    );
  });
});
