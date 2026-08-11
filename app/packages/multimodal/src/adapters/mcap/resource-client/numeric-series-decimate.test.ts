import { describe, expect, it } from "vitest";
import {
  decimateMinMax,
  NUMERIC_SERIES_BUCKET_GAP,
} from "./numeric-series-decimate";

describe("decimateMinMax", () => {
  it("passes through inputs at or under budget", () => {
    const times = Float64Array.from([0, 1, 2, 3]);
    const values = Float64Array.from([5, 6, 7, 8]);
    const result = decimateMinMax(times, values, 100);
    expect([...result.times]).toEqual([0, 1, 2, 3]);
    expect([...result.values]).toEqual([5, 6, 7, 8]);
    expect([...result.bucketGapMask]).toEqual([0]);
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
    expect(
      [...result.bucketGapMask].some(
        (mask) => (mask & NUMERIC_SERIES_BUCKET_GAP.ALL_NAN) !== 0,
      ),
    ).toBe(true);
  });

  it("preserves a gap inside a mixed finite/NaN bucket", () => {
    const times = Float64Array.from({ length: 100 }, (_, index) => index);
    const values = Float64Array.from({ length: 100 }, () => 1);
    values[50] = Number.NaN;

    const result = decimateMinMax(times, values, 10);
    const gapIndex = [...result.values].findIndex(Number.isNaN);

    expect(gapIndex).toBeGreaterThan(0);
    expect(gapIndex).toBeLessThan(result.values.length - 1);
    expect(result.bucketGapMask[0] & NUMERIC_SERIES_BUCKET_GAP.INTERIOR).toBe(
      NUMERIC_SERIES_BUCKET_GAP.INTERIOR,
    );
    expect(result.times.length).toBeLessThanOrEqual(10);
  });

  it("collapses multiple bucket gaps instead of bridging finite islands", () => {
    const times = Float64Array.from({ length: 100 }, (_, index) => index);
    const values = Float64Array.from({ length: 100 }, () => 1);
    values[20] = Number.NaN;
    values[50] = 999;
    values[80] = Number.NaN;

    const result = decimateMinMax(times, values, 10);
    const gapIndex = [...result.values].findIndex(Number.isNaN);

    expect(gapIndex).toBeGreaterThan(0);
    expect(gapIndex).toBeLessThan(result.values.length - 1);
    expect([...result.values]).not.toContain(999);
    expect(Math.max(...result.times.slice(0, gapIndex))).toBeLessThan(20);
    expect(Math.min(...result.times.slice(gapIndex + 1))).toBeGreaterThan(80);
  });

  it("records leading, trailing, and bucket-boundary gaps", () => {
    const times = Float64Array.from({ length: 30 }, (_, index) => index);
    const values = Float64Array.from({ length: 30 }, () => 1);
    values[0] = Number.NaN;
    values[9] = Number.NaN;
    values[10] = Number.NaN;
    values[29] = Number.NaN;

    // 17 points reserve two endpoints and permit three ten-sample buckets.
    const result = decimateMinMax(times, values, 17);

    expect(result.bucketGapMask).toHaveLength(3);
    expect(result.bucketGapMask[0] & NUMERIC_SERIES_BUCKET_GAP.LEADING).toBe(
      NUMERIC_SERIES_BUCKET_GAP.LEADING,
    );
    expect(result.bucketGapMask[0] & NUMERIC_SERIES_BUCKET_GAP.TRAILING).toBe(
      NUMERIC_SERIES_BUCKET_GAP.TRAILING,
    );
    expect(result.bucketGapMask[1] & NUMERIC_SERIES_BUCKET_GAP.LEADING).toBe(
      NUMERIC_SERIES_BUCKET_GAP.LEADING,
    );
    expect(result.bucketGapMask[2] & NUMERIC_SERIES_BUCKET_GAP.TRAILING).toBe(
      NUMERIC_SERIES_BUCKET_GAP.TRAILING,
    );
    expect([...result.values].filter(Number.isNaN).length).toBeGreaterThan(2);
    expect(result.times.length).toBeLessThanOrEqual(17);
  });

  it("keeps an adversarial alternating-gap series within its hard bound", () => {
    const length = 100_000;
    const times = Float64Array.from({ length }, (_, index) => index);
    const values = Float64Array.from({ length }, (_, index) =>
      index % 2 === 0 ? index : Number.NaN,
    );

    const result = decimateMinMax(times, values, 1_000);

    expect(result.times.length).toBeLessThanOrEqual(1_000);
    expect(result.values.length).toBe(result.times.length);
    expect([...result.values].some(Number.isNaN)).toBe(true);
    expect(
      [...result.bucketGapMask].every(
        (mask) => (mask & NUMERIC_SERIES_BUCKET_GAP.INTERIOR) !== 0,
      ),
    ).toBe(true);
  });

  it("honors tiny finite budgets without drawing through a gap", () => {
    const times = Float64Array.from([0, 1, 2, 3, 4, 5, 6, 7]);
    const values = Float64Array.from([1, 2, 3, Number.NaN, 4, 5, 6, 7]);

    for (let budget = 0; budget <= 6; budget += 1) {
      const result = decimateMinMax(times, values, budget);
      expect(result.times.length).toBeLessThanOrEqual(budget);
      expect(result.values.length).toBe(result.times.length);
      if (budget > 0) {
        expect([...result.values].some(Number.isNaN)).toBe(true);
      }
      expect(result.bucketGapMask[0] & NUMERIC_SERIES_BUCKET_GAP.INTERIOR).toBe(
        NUMERIC_SERIES_BUCKET_GAP.INTERIOR,
      );
    }
  });
});
