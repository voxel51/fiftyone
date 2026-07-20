import { describe, expect, it } from "vitest";
import { createTimelineIndex } from "./timeline-index";

describe("timeline index", () => {
  it("represents the default 30 Hz tick grid without materializing it", () => {
    const timeline = createTimelineIndex({ endNs: 100_000_000n, startNs: 0n });

    expect(timeline.stepNs).toBe(33_333_333n);
    expect(timeline.tickCount).toBe(4);
    expect([0, 1, 2, 3].map((index) => timeline.tickAt(index))).toEqual([
      0n,
      33_333_333n,
      66_666_666n,
      99_999_999n,
    ]);
  });

  it("keeps long recordings addressable without materializing ticks", () => {
    const timeline = createTimelineIndex({
      endNs: 7_200_000_000_000n,
      startNs: 0n,
    });

    expect(timeline.tickCount).toBe(216_001);
    expect(timeline.nearestTick(7_199)).toBeGreaterThan(7_198_900_000_000n);
  });

  it("retains bigint precision and uses ceiling division", () => {
    const startNs = 10_000_000_000_000_000n;
    const timeline = createTimelineIndex(
      { endNs: startNs + 1_000_000_000n, startNs },
      2,
    );

    expect(timeline.stepNs).toBe(500_000_000n);
    expect(timeline.tickCount).toBe(3);
    expect(timeline.tickAt(2)).toBe(startNs + 1_000_000_000n);
    expect(timeline.indexAtOrAfter(startNs + 1n)).toBe(1);
    expect(timeline.indexAtOrAfter(startNs + 500_000_000n)).toBe(1);
    expect(timeline.indexAtOrAfter(startNs + 1_000_000_001n)).toBe(3);
    expect(timeline.nsToSec(startNs + 500_000_000n)).toBe(0.5);
    expect(timeline.secToNs(0.5)).toBe(startNs + 500_000_000n);
  });

  it("handles a zero-duration range and invalid tick indexes", () => {
    const timeline = createTimelineIndex({ endNs: 42n, startNs: 42n });
    expect(timeline.durationSec).toBe(0);
    expect(timeline.tickCount).toBe(1);
    expect(timeline.tickAt(0)).toBe(42n);
    expect(timeline.tickAt(1)).toBeUndefined();
    expect(timeline.tickAt(0.5)).toBeUndefined();
  });

  it("rejects non-ticks and resolves midpoint ties to the earlier tick", () => {
    const timeline = createTimelineIndex(
      { endNs: 1_000_000_000n, startNs: 0n },
      2,
    );
    expect(timeline.indexOfTick(250_000_000n)).toBeUndefined();
    expect(timeline.indexOfTick(500_000_000n)).toBe(1);
    expect(timeline.nearestTick(0.25)).toBe(0n);
    expect(timeline.nearestTick(0.26)).toBe(500_000_000n);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid tick rate %s",
    (tickRateHz) => {
      expect(() =>
        createTimelineIndex({ endNs: 1n, startNs: 0n }, tickRateHz),
      ).toThrow("Timeline tick rate must be finite and greater than zero");
    },
  );

  it("rejects reversed ranges", () => {
    expect(() => createTimelineIndex({ endNs: 0n, startNs: 1n })).toThrow(
      "Timeline range end cannot be before start",
    );
  });

  it.each([Number.NaN, Number.NEGATIVE_INFINITY])(
    "rejects non-finite seconds %s",
    (timeSec) => {
      const timeline = createTimelineIndex({ endNs: 1n, startNs: 0n });
      expect(() => timeline.secToNs(timeSec)).toThrow(
        "Timeline time in seconds must be finite",
      );
    },
  );
});
