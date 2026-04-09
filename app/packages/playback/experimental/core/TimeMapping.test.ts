import { describe, expect, it } from "vitest";
import { durationToSequence, sequenceToDuration } from "./TimeMapping";

describe("sequenceToDuration", () => {
  it("converts frame 1 to origin time", () => {
    expect(sequenceToDuration(1, 30)).toBe(0);
    expect(sequenceToDuration(1, 30, 1000)).toBe(1000);
  });

  it("converts frames to nanoseconds at 30fps", () => {
    // frame 2 → 1/30 second = 33_333_333.33... ns
    const result = sequenceToDuration(2, 30);
    expect(result).toBeCloseTo(1e9 / 30, 0);
  });

  it("converts frames to nanoseconds at 60fps", () => {
    // frame 31 → 30/60 = 0.5 second = 500_000_000 ns
    expect(sequenceToDuration(31, 60)).toBe(0.5e9);
  });

  it("applies origin offset", () => {
    const origin = 5e9; // 5 seconds
    // frame 1 → origin
    expect(sequenceToDuration(1, 30, origin)).toBe(origin);
    // frame 31 → origin + 1 second
    expect(sequenceToDuration(31, 30, origin)).toBe(origin + 1e9);
  });

  it("handles fractional fps", () => {
    // frame 2 at 24fps → 1/24 second
    const result = sequenceToDuration(2, 24);
    expect(result).toBeCloseTo(1e9 / 24, 0);
  });
});

describe("durationToSequence", () => {
  it("converts origin time to frame 1", () => {
    expect(durationToSequence(0, 30)).toBe(1);
    expect(durationToSequence(1000, 30, 1000)).toBe(1);
  });

  it("converts nanoseconds to frames at 30fps", () => {
    // 1 second → frame 31
    expect(durationToSequence(1e9, 30)).toBe(31);
  });

  it("converts nanoseconds to frames at 60fps", () => {
    // 0.5 second → frame 31
    expect(durationToSequence(0.5e9, 60)).toBe(31);
  });

  it("applies origin offset", () => {
    const origin = 5e9;
    expect(durationToSequence(origin, 30, origin)).toBe(1);
    expect(durationToSequence(origin + 1e9, 30, origin)).toBe(31);
  });

  it("rounds to nearest frame", () => {
    // Slightly past frame boundary
    const slightlyPast = 1e9 / 30 + 1; // just past frame 2
    expect(durationToSequence(slightlyPast, 30)).toBe(2);
  });
});

describe("round-trip conversions", () => {
  it("converts sequence → duration → sequence losslessly", () => {
    for (let frame = 1; frame <= 100; frame++) {
      const nanos = sequenceToDuration(frame, 30);
      const back = durationToSequence(nanos, 30);
      expect(back).toBe(frame);
    }
  });

  it("round-trips with origin offset", () => {
    const origin = 1e9;
    for (let frame = 1; frame <= 50; frame++) {
      const nanos = sequenceToDuration(frame, 24, origin);
      const back = durationToSequence(nanos, 24, origin);
      expect(back).toBe(frame);
    }
  });
});
