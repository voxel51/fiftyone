import { describe, expect, it } from "vitest";
import { aggregateAlignedNumericSeries } from "./numeric-series-buckets";

describe("aggregateAlignedNumericSeries", () => {
  it("preserves spikes and source gaps", () => {
    const result = aggregateAlignedNumericSeries(
      Float64Array.from({ length: 20 }, (_, index) => index / 10),
      Float64Array.from({ length: 20 }, (_, index) =>
        index === 7 ? 100 : index === 12 ? Number.NaN : index % 3,
      ),
      0n,
      1_000_000_000n,
    );

    expect([...result.values]).toContain(100);
    expect([...result.values].some(Number.isNaN)).toBe(true);
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
    );

    expect([...merged.timesSec]).toEqual([...whole.timesSec]);
    expect([...merged.values]).toEqual([...whole.values]);
  });

  it("emits at most five representatives per bucket", () => {
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
