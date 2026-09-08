import { describe, expect, it } from "vitest";
import {
  frameTransformIndexedRangeEndCovering,
  isFrameTransformRangeIndexed,
  isFrameTransformTimeIndexed,
  mergeFrameTransformTimeRanges,
} from "./frame-transform-ranges";

describe("mergeFrameTransformTimeRanges", () => {
  it("sorts and merges overlapping, touching, and adjacent ranges", () => {
    expect(
      mergeFrameTransformTimeRanges([
        { endTimeNs: 14n, startTimeNs: 12n },
        { endTimeNs: 3n, startTimeNs: 1n },
        { endTimeNs: 8n, startTimeNs: 4n },
        { endTimeNs: 13n, startTimeNs: 8n },
      ]),
    ).toEqual([{ endTimeNs: 14n, startTimeNs: 1n }]);
  });

  it("keeps ranges separated by more than one nanosecond", () => {
    expect(
      mergeFrameTransformTimeRanges([
        { endTimeNs: 3n, startTimeNs: 1n },
        { endTimeNs: 8n, startTimeNs: 5n },
      ]),
    ).toEqual([
      { endTimeNs: 3n, startTimeNs: 1n },
      { endTimeNs: 8n, startTimeNs: 5n },
    ]);
  });

  it("answers point and window coverage from canonical ranges", () => {
    const ranges = [
      { endTimeNs: 3n, startTimeNs: 1n },
      { endTimeNs: 8n, startTimeNs: 5n },
    ];

    expect(isFrameTransformTimeIndexed(ranges, 1n)).toBe(true);
    expect(isFrameTransformTimeIndexed(ranges, 4n)).toBe(false);
    expect(
      isFrameTransformRangeIndexed(ranges, {
        endTimeNs: 7n,
        startTimeNs: 6n,
      }),
    ).toBe(true);
    expect(
      isFrameTransformRangeIndexed(ranges, {
        endTimeNs: 5n,
        startTimeNs: 3n,
      }),
    ).toBe(false);
    expect(frameTransformIndexedRangeEndCovering(ranges, 6n)).toBe(8n);
    expect(frameTransformIndexedRangeEndCovering(ranges, 4n)).toBeNull();
  });
});
