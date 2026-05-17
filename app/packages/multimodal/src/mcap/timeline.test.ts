import { describe, expect, it } from "vitest";
import {
  DEFAULT_MCAP_TIMELINE_TICK_RATE_HZ,
  assertSupportedMcapActiveTimeline,
  createMcapTimelineTicks,
  resolveMcapActiveTimeline,
} from "./timeline";
import { MCAP_ACTIVE_TIMELINE } from "./types";

describe("MCAP timeline helpers", () => {
  it("defaults the active timeline to log", () => {
    expect(resolveMcapActiveTimeline(undefined)).toBe(MCAP_ACTIVE_TIMELINE.LOG);
  });

  it("rejects non-log active timelines until implemented", () => {
    expect(() =>
      assertSupportedMcapActiveTimeline(MCAP_ACTIVE_TIMELINE.PUBLISH)
    ).toThrow("not implemented yet");
  });

  it("generates fixed-rate timeline ticks within the range", () => {
    expect(
      createMcapTimelineTicks({
        endTimeNs: 100_000_000n,
        startTimeNs: 0n,
      })
    ).toEqual([0n, 33_333_333n, 66_666_666n, 99_999_999n]);
  });

  it("supports custom tick rates and max tick guards", () => {
    expect(
      createMcapTimelineTicks(
        {
          endTimeNs: 1_000_000_000n,
          startTimeNs: 0n,
        },
        {
          maxTicks: 3,
          tickRateHz: 10,
        }
      )
    ).toEqual([0n, 100_000_000n, 200_000_000n]);
    expect(DEFAULT_MCAP_TIMELINE_TICK_RATE_HZ).toBe(30);
  });
});
