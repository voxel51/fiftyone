import { describe, expect, it } from "vitest";
import { aggregateAlignedNumericSeries } from "./numeric-series-buckets";

describe("aggregateAlignedNumericSeries", () => {
  it("preserves spikes and source gaps", () => {
    const result = aggregateAlignedNumericSeries(
      Float64Array.from({ length: 20 }, (_, index) => index / 10),
      Float64Array.from({ length: 20 }, (_, index) =>
        index === 7
          ? 100
          : index === 12
            ? Number.NaN
            : index === 15
              ? Number.POSITIVE_INFINITY
              : index % 3,
      ),
      0n,
      1_000_000_000n,
    );

    expect([...result.values]).toContain(100);
    expect([...result.values].some(Number.isNaN)).toBe(true);
    expect([...result.values]).not.toContain(Number.POSITIVE_INFINITY);
  });

  it("is invariant to continuation page boundaries", () => {
    const times = Float64Array.from(
      { length: 40 },
      (_, index) => 10.03 + index * 0.025,
    );
    const values = Float64Array.from({ length: 40 }, (_, index) =>
      index === 13
        ? 90
        : index === 11 || index === 24
          ? Number.NaN
          : Math.sin(index / 3),
    );
    const bucketDurationNs = 200_000_000n;
    const whole = aggregateAlignedNumericSeries(
      times,
      values,
      1_700_000_000_000_000_000n,
      bucketDurationNs,
    );
    const pages = [
      aggregateAlignedNumericSeries(
        times.slice(0, 17),
        values.slice(0, 17),
        1_700_000_000_000_000_000n,
        bucketDurationNs,
      ),
      aggregateAlignedNumericSeries(
        times.slice(17, 29),
        values.slice(17, 29),
        1_700_000_000_000_000_000n,
        bucketDurationNs,
      ),
      aggregateAlignedNumericSeries(
        times.slice(29),
        values.slice(29),
        1_700_000_000_000_000_000n,
        bucketDurationNs,
      ),
    ];
    const merged = aggregateAlignedNumericSeries(
      Float64Array.from(pages.flatMap((page) => [...page.timesSec])),
      Float64Array.from(pages.flatMap((page) => [...page.values])),
      1_700_000_000_000_000_000n,
      bucketDurationNs,
      BigInt64Array.from(pages.flatMap((page) => [...page.bucketIndexes])),
    );

    expect([...merged.timesSec]).toEqual([...whole.timesSec]);
    expect([...merged.values]).toEqual([...whole.values]);
  });

  it("retains exact bucket identities beyond float nanosecond precision", () => {
    const baseTimeNs = 1_700_000_000_000_000_000n;
    const absoluteTimes = [
      baseTimeNs + 9_007_199_254_740_992n,
      baseTimeNs + 9_007_199_254_740_993n,
    ];
    const timesSec = Float64Array.from(
      absoluteTimes,
      (timeNs) => Number(timeNs - baseTimeNs) / 1e9,
    );
    const bucketIndexes = BigInt64Array.from(absoluteTimes, (timeNs) => timeNs);
    const result = aggregateAlignedNumericSeries(
      timesSec,
      Float64Array.from([1, 2]),
      baseTimeNs,
      1n,
      bucketIndexes,
    );

    expect([...result.bucketIndexes]).toEqual(absoluteTimes);
    expect([...result.values]).toEqual([1, 2]);
  });

  it("emits at most six representatives per bucket", () => {
    const result = aggregateAlignedNumericSeries(
      Float64Array.from({ length: 100_000 }, (_, index) => index / 1_000),
      Float64Array.from({ length: 100_000 }, (_, index) =>
        index % 29 === 0 ? Number.NaN : Math.sin(index),
      ),
      0n,
      61_000_000n,
    );

    expect(result.values.length).toBeLessThanOrEqual(10_000);
    expect([...result.values].some(Number.isNaN)).toBe(true);
  });
});
