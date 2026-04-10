import { describe, expect, it } from "vitest";
import {
  findNearestTimestampAtOrAfter,
  findNearestTimestampAtOrBefore,
  getMcapWindowsForRange,
  getTimelineTimestampRangeForFrames,
  inferMcapTimelineFrameRate,
} from "./playback-utils";

describe("playback utils", () => {
  it("finds the nearest timestamps on either side of the playback cursor", () => {
    const timestampsNs = [10, 20, 40];

    expect(findNearestTimestampAtOrBefore(timestampsNs, 5)).toBeNull();
    expect(findNearestTimestampAtOrBefore(timestampsNs, 27)).toBe(20);
    expect(findNearestTimestampAtOrAfter(timestampsNs, 27)).toBe(40);
  });

  it("maps frame ranges to shared timeline timestamps", () => {
    expect(getTimelineTimestampRangeForFrames([10, 20, 30], [1, 3])).toEqual({
      startNs: 10,
      endNs: 30,
    });
  });

  it("infers a bounded target frame rate from shared timestamps", () => {
    expect(inferMcapTimelineFrameRate([10])).toBe(1);
    expect(
      inferMcapTimelineFrameRate([0, 100_000_000, 200_000_000, 300_000_000])
    ).toBe(10);
  });

  it("splits fetches into fixed scene-relative windows", () => {
    expect(
      getMcapWindowsForRange(
        { startNs: 10, endNs: 10_000_000_020 },
        { startNs: 2_000_000_010, endNs: 7_500_000_010 },
        3_000_000_000
      )
    ).toEqual([
      { startNs: 10, endNs: 3_000_000_009 },
      { startNs: 3_000_000_010, endNs: 6_000_000_009 },
      { startNs: 6_000_000_010, endNs: 9_000_000_009 },
    ]);
  });
});
