import { describe, expect, it } from "vitest";
import { getLoadRangeForFrameNumber } from "./utils";

describe("experimental playback utils", () => {
  it("builds time-relative load ranges for duration timelines", () => {
    expect(
      getLoadRangeForFrameNumber(5_000_000_000, {
        type: "duration",
        duration: 10_000_000_000,
        speed: 1,
        tickRate: 60,
      })
    ).toEqual([4_000_000_000, 7_000_000_000]);
  });
});
