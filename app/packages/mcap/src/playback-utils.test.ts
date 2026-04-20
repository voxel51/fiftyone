import { describe, expect, it } from "vitest";
import {
  findPlaybackTimestampForNearestSync,
  findNearestTimestampAtOrAfter,
  findNearestTimestampAtOrBefore,
  getMultimodalWindowsForRange,
  getTimelineTimestampRangeForFrames,
  inferMultimodalTimelineFrameRate,
} from "./playback-utils";

describe("playback utils", () => {
  it("finds sync timestamps using latest-at-or-before semantics", () => {
    const timestampsNs = [10, 20, 40];

    expect(findNearestTimestampAtOrBefore(timestampsNs, 5)).toBeNull();
    expect(findNearestTimestampAtOrBefore(timestampsNs, 27)).toBe(20);
    expect(findNearestTimestampAtOrAfter(timestampsNs, 27)).toBe(40);
    expect(findPlaybackTimestampForNearestSync(timestampsNs, 5)).toBe(10);
    expect(findPlaybackTimestampForNearestSync(timestampsNs, 27)).toBe(20);
    expect(findPlaybackTimestampForNearestSync(timestampsNs, 38)).toBe(20);
  });

  it("maps frame ranges to shared timeline timestamps", () => {
    expect(getTimelineTimestampRangeForFrames([10, 20, 30], [1, 3])).toEqual({
      startNs: 10,
      endNs: 30,
    });
  });

  it("infers a bounded target frame rate from shared timestamps", () => {
    expect(inferMultimodalTimelineFrameRate([10])).toBe(1);
    expect(
      inferMultimodalTimelineFrameRate([
        0, 100_000_000, 200_000_000, 300_000_000,
      ])
    ).toBe(10);
  });

  it("splits fetches into fixed scene-relative windows", () => {
    expect(
      getMultimodalWindowsForRange(
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
