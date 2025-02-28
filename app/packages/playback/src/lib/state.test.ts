import { describe, expect, it, vitest } from "vitest";
import { getLoadRangeForFrameNumber } from "./state";

vitest.mock("./constants", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./constants")>();
  return {
    ...actual,
    MIN_LOAD_RANGE_SIZE: 5,
    DEFAULT_TARGET_FRAME_RATE: 30,
  };
});

describe("getLoadRangeForFrameNumber", () => {
  it("returns correct range for a middle frame with default speed/targetFrameRate", () => {
    const config = {
      totalFrames: 100,
      targetFrameRate: 30,
      speed: 1,
    };
    // behindBuffer = 5
    // baseAdaptiveBuffer = 5 * 1 * (30/30) = 5
    // totalFramesFactor = ceil(100 * 0.02) = 2
    // adaptiveAheadBuffer = max(5, ceil(5 + 2)) = 7
    // => range = [50 - 5, 50 + 7] = [45, 57]
    expect(getLoadRangeForFrameNumber(50, config)).toEqual([45, 57]);
  });

  it("returns correct range when near the beginning of the timeline", () => {
    const config = {
      totalFrames: 100,
      targetFrameRate: 30,
      speed: 1,
    };
    // frameNumber = 3:
    // behindBuffer = 5 → initial min = 3 - 5 = -2
    // adaptiveAheadBuffer = 7 (as above) → initial max = 3 + 7 = 10
    // Since min < 1, extra = 1 - (-2) = 3, so final range = [1, 10 + 3] = [1, 13]
    expect(getLoadRangeForFrameNumber(3, config)).toEqual([1, 13]);
  });

  it("returns correct range when near the end of the timeline", () => {
    const config = {
      totalFrames: 100,
      targetFrameRate: 30,
      speed: 1,
    };
    // frameNumber = 98:
    // behindBuffer = 5 → initial min = 98 - 5 = 93
    // adaptiveAheadBuffer = 7 → initial max = 98 + 7 = 105
    // max > totalFrames, extra = 105 - 100 = 5, so adjust min = max(1, 93 - 5) = 88 and max = 100.
    expect(getLoadRangeForFrameNumber(98, config)).toEqual([88, 100]);
  });

  it("returns correct range for custom speed and targetFrameRate", () => {
    const config = {
      totalFrames: 200,
      targetFrameRate: 60,
      speed: 2,
    };
    // frameNumber = 50:
    // behindBuffer = 5 → min = 50 - 5 = 45
    // baseAdaptiveBuffer = 5 * 2 * (60/30) = 20
    // totalFramesFactor = ceil(200 * 0.02) = 4
    // adaptiveAheadBuffer = max(5, ceil(20 + 4)) = 24
    // => max = 50 + 24 = 74, range = [45, 74]
    expect(getLoadRangeForFrameNumber(50, config)).toEqual([45, 74]);
  });

  it("returns full timeline range when timeline is very short", () => {
    const config = {
      totalFrames: 10,
      targetFrameRate: 30,
      speed: 1,
    };
    // frameNumber = 8:
    // behindBuffer = 5 → min = 8 - 5 = 3
    // baseAdaptiveBuffer = 5
    // totalFramesFactor = ceil(10 * 0.02) = ceil(0.2) = 1
    // adaptiveAheadBuffer = max(5, ceil(5 + 1)) = 6
    // initial max = 8 + 6 = 14, then extra = 14 - 10 = 4, so final range = [max(1, 3 - 4), 10] = [1, 10]
    expect(getLoadRangeForFrameNumber(8, config)).toEqual([1, 10]);
  });

  it("defaults speed and targetFrameRate when undefined", () => {
    const config = {
      totalFrames: 100,
    };
    // with defaults, the calculation is as in the first test.
    expect(getLoadRangeForFrameNumber(50, config)).toEqual([45, 57]);
  });

  it("returns correct range when frameNumber is at the very start", () => {
    const config = {
      totalFrames: 100,
      targetFrameRate: 30,
      speed: 1,
    };
    // frameNumber = 1:
    // behindBuffer = 5 → initial min = 1 - 5 = -4
    // adaptiveAheadBuffer = 7 → initial max = 1 + 7 = 8
    // min < 1, extra = 1 - (-4) = 5, adjust range to [1, 8 + 5] = [1, 13]
    expect(getLoadRangeForFrameNumber(1, config)).toEqual([1, 13]);
  });

  it("returns correct range when frameNumber is at the very end", () => {
    const config = {
      totalFrames: 100,
      targetFrameRate: 30,
      speed: 1,
    };
    // frameNumber = 100:
    // behindBuffer = 5 → min = 100 - 5 = 95
    // adaptiveAheadBuffer = 7 → initial max = 100 + 7 = 107, then extra = 107 - 100 = 7,
    // adjust min = max(1, 95 - 7) = 88, and set max = 100.
    expect(getLoadRangeForFrameNumber(100, config)).toEqual([88, 100]);
  });
});
