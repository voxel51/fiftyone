/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, it } from "vitest";
import {
  type FrameRange,
  isInFetchedRange,
  mergeRange,
  toSecondRanges,
} from "./fetchedRanges";

describe("mergeRange", () => {
  it("adds the first range to an empty list", () => {
    const ranges: FrameRange[] = [];
    mergeRange(ranges, [5, 10]);
    expect(ranges).toEqual([[5, 10]]);
  });

  it("keeps non-adjacent ranges separate", () => {
    const ranges: FrameRange[] = [[1, 5]];
    mergeRange(ranges, [10, 15]);
    expect(ranges).toEqual([
      [1, 5],
      [10, 15],
    ]);
  });

  it("coalesces an adjacent range (gap of exactly one frame)", () => {
    const ranges: FrameRange[] = [[1, 5]];
    // 6 === 5 + 1, so the chunks touch and should merge.
    mergeRange(ranges, [6, 10]);
    expect(ranges).toEqual([[1, 10]]);
  });

  it("merges overlapping ranges", () => {
    const ranges: FrameRange[] = [[1, 8]];
    mergeRange(ranges, [5, 12]);
    expect(ranges).toEqual([[1, 12]]);
  });

  it("sorts then merges an out-of-order insert", () => {
    const ranges: FrameRange[] = [[20, 25]];
    mergeRange(ranges, [1, 5]);
    mergeRange(ranges, [6, 19]);
    expect(ranges).toEqual([[1, 25]]);
  });

  it("absorbs a fully-contained range without shrinking the span", () => {
    const ranges: FrameRange[] = [[1, 20]];
    mergeRange(ranges, [5, 10]);
    expect(ranges).toEqual([[1, 20]]);
  });
});

describe("isInFetchedRange", () => {
  const ranges: FrameRange[] = [
    [1, 5],
    [10, 15],
  ];

  it("returns true for a frame inside a range", () => {
    expect(isInFetchedRange(ranges, 12)).toBe(true);
  });

  it("is inclusive of both endpoints", () => {
    expect(isInFetchedRange(ranges, 1)).toBe(true);
    expect(isInFetchedRange(ranges, 5)).toBe(true);
    expect(isInFetchedRange(ranges, 10)).toBe(true);
    expect(isInFetchedRange(ranges, 15)).toBe(true);
  });

  it("returns false for a frame in a gap or outside all ranges", () => {
    expect(isInFetchedRange(ranges, 7)).toBe(false);
    expect(isInFetchedRange(ranges, 20)).toBe(false);
  });

  it("returns false against an empty list", () => {
    expect(isInFetchedRange([], 1)).toBe(false);
  });
});

describe("toSecondRanges", () => {
  it("shifts the start back one frame and divides by the frame rate", () => {
    // At 10 fps, frames 1..10 cover [0, 1] seconds.
    expect(toSecondRanges([[1, 10]], 10)).toEqual([[0, 1]]);
  });

  it("converts each range independently", () => {
    expect(
      toSecondRanges(
        [
          [1, 5],
          [11, 20],
        ],
        10
      )
    ).toEqual([
      [0, 0.5],
      [1, 2],
    ]);
  });

  it("returns an empty list for no ranges", () => {
    expect(toSecondRanges([], 30)).toEqual([]);
  });
});
