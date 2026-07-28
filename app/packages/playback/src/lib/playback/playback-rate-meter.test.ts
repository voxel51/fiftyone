import { describe, expect, it } from "vitest";
import { createPlaybackRateMeter } from "./playback-rate-meter";

describe("createPlaybackRateMeter", () => {
  it("reports committed media seconds per wall second", () => {
    const meter = createPlaybackRateMeter();
    meter.reset(0);

    for (let wallMs = 100; wallMs < 1_000; wallMs += 100) {
      expect(meter.sample(wallMs, 0.4)).toBeNull();
    }
    expect(meter.sample(1_000, 0.4)).toBeCloseTo(4);
  });

  it("includes stalled ticks in the wall-time denominator", () => {
    const meter = createPlaybackRateMeter();
    meter.reset(0);

    meter.sample(100, 0.4);
    meter.sample(200, 0.4);
    for (let wallMs = 300; wallMs < 1_000; wallMs += 100) {
      meter.sample(wallMs, 0);
    }

    expect(meter.sample(1_000, 0)).toBeCloseTo(0.8);
  });

  it("starts a fresh window after reset or a clock rollback", () => {
    const meter = createPlaybackRateMeter(100);
    meter.reset(1_000);
    expect(meter.sample(1_050, 1)).toBeNull();
    meter.reset(2_000);
    expect(meter.sample(2_100, 0.2)).toBeCloseTo(2);

    expect(meter.sample(1_000, 100)).toBeNull();
    expect(meter.sample(1_100, 0.2)).toBeCloseTo(2);
  });
});
