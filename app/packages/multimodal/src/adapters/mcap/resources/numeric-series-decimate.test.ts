import { describe, expect, it } from "vitest";
import { decimateMinMax } from "./numeric-series-decimate";

describe("decimateMinMax", () => {
  it("passes through inputs at or under budget", () => {
    const times = Float64Array.from([0, 1, 2, 3]);
    const values = Float64Array.from([5, 6, 7, 8]);
    const result = decimateMinMax(times, values, 100);
    expect([...result.times]).toEqual([0, 1, 2, 3]);
    expect([...result.values]).toEqual([5, 6, 7, 8]);
  });

  it("bounds output length by maxPoints", () => {
    const length = 100_000;
    const times = new Float64Array(length);
    const values = new Float64Array(length);
    for (let i = 0; i < length; i += 1) {
      times[i] = i;
      values[i] = Math.sin(i / 500);
    }
    const result = decimateMinMax(times, values, 4_000);
    expect(result.times.length).toBeLessThanOrEqual(4_000);
    expect(result.times.length).toBeGreaterThan(1_000);
  });

  it("preserves a single-sample spike that uniform stride would drop", () => {
    const length = 50_000;
    const times = new Float64Array(length);
    const values = new Float64Array(length);
    for (let i = 0; i < length; i += 1) {
      times[i] = i;
      values[i] = 1;
    }
    values[31_337] = 999;
    const result = decimateMinMax(times, values, 1_000);
    expect(Math.max(...result.values)).toBe(999);
  });

  it("always keeps the first and last points", () => {
    const length = 10_000;
    const times = new Float64Array(length);
    const values = new Float64Array(length);
    for (let i = 0; i < length; i += 1) {
      times[i] = i * 0.1;
      values[i] = i;
    }
    const result = decimateMinMax(times, values, 100);
    expect(result.times[0]).toBe(0);
    expect(result.times[result.times.length - 1]).toBeCloseTo(
      (length - 1) * 0.1,
    );
  });

  it("keeps output in time order", () => {
    const length = 25_000;
    const times = new Float64Array(length);
    const values = new Float64Array(length);
    for (let i = 0; i < length; i += 1) {
      times[i] = i;
      values[i] = ((i * 2_654_435_761) % 1_000) - 500;
    }
    const result = decimateMinMax(times, values, 500);
    for (let i = 1; i < result.times.length; i += 1) {
      expect(result.times[i]).toBeGreaterThan(result.times[i - 1]);
    }
  });

  it("keeps one NaN gap marker for an all-NaN bucket", () => {
    const length = 30_000;
    const times = new Float64Array(length);
    const values = new Float64Array(length);
    for (let i = 0; i < length; i += 1) {
      times[i] = i;
      // A wide missing-data region in the middle of the recording.
      values[i] = i > 10_000 && i < 20_000 ? Number.NaN : 1;
    }
    const result = decimateMinMax(times, values, 300);
    expect([...result.values].some((value) => Number.isNaN(value))).toBe(true);
  });
});
