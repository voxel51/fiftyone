import { describe, expect, it } from "vitest";
import {
  addCoveredRange,
  completeNumericSeriesPrefix,
  contiguousNumericSeriesPrefix,
  coveredNumericSeriesSeconds,
  flattenSeriesSegments,
  FULL_NUMERIC_SERIES_COVERAGE,
  insertSeriesSegment,
  nearestNumericSeriesRange,
  numericSeriesKey,
  numericSeriesRangeDurationSeconds,
  numericSeriesRangesOverlap,
  numericSeriesWindowPointBudget,
  quantizedNumericSeriesWindow,
  removeCoveredRange,
  sliceNumericFieldToRange,
  splitNumericSeriesKey,
  subtractCoveredRanges,
  type NsRange,
} from "./numeric-series-window";

describe("contiguous numeric-series publication", () => {
  it("stops before unread interior coverage", () => {
    expect(
      contiguousNumericSeriesPrefix({ endNs: 99n, startNs: 0n }, [
        { endNs: 39n, startNs: 20n },
        { endNs: 19n, startNs: 0n },
        { endNs: 99n, startNs: 60n },
      ]),
    ).toEqual({ endNs: 39n, startNs: 0n });
  });

  it("publishes only complete progressive buckets", () => {
    const window = { endNs: 99n, startNs: 5n };
    expect(
      completeNumericSeriesPrefix(window, { endNs: 54n, startNs: 5n }, 20n),
    ).toEqual({ endNs: 39n, startNs: 5n });
    expect(completeNumericSeriesPrefix(window, { ...window }, 20n)).toEqual(
      window,
    );
  });
});
import { createTimelineIndex } from "./timeline-index";

const range = (startNs: bigint, endNs: bigint): NsRange => ({ endNs, startNs });

describe("subtractCoveredRanges", () => {
  it("returns the whole window when nothing is covered", () => {
    expect(subtractCoveredRanges(range(10n, 20n), [])).toEqual([
      range(10n, 20n),
    ]);
  });

  it("returns nothing when the window is fully covered", () => {
    expect(subtractCoveredRanges(range(10n, 20n), [range(0n, 100n)])).toEqual(
      [],
    );
  });

  it("returns the holes around covered ranges", () => {
    expect(
      subtractCoveredRanges(range(0n, 100n), [
        range(10n, 20n),
        range(40n, 50n),
      ]),
    ).toEqual([range(0n, 9n), range(21n, 39n), range(51n, 100n)]);
  });

  it("clips coverage outside the window", () => {
    expect(
      subtractCoveredRanges(range(10n, 20n), [range(0n, 12n), range(18n, 30n)]),
    ).toEqual([range(13n, 17n)]);
  });
});

describe("addCoveredRange", () => {
  it("keeps ranges sorted and disjoint", () => {
    let covered: NsRange[] = [];
    covered = addCoveredRange(covered, range(40n, 50n));
    covered = addCoveredRange(covered, range(10n, 20n));
    expect(covered).toEqual([range(10n, 20n), range(40n, 50n)]);
  });

  it("merges overlapping ranges", () => {
    expect(
      addCoveredRange([range(10n, 20n), range(40n, 50n)], range(15n, 45n)),
    ).toEqual([range(10n, 50n)]);
  });

  it("merges abutting ranges (1ns apart)", () => {
    expect(addCoveredRange([range(10n, 20n)], range(21n, 30n))).toEqual([
      range(10n, 30n),
    ]);
  });

  it("keeps genuinely separate ranges apart", () => {
    expect(addCoveredRange([range(10n, 20n)], range(22n, 30n))).toEqual([
      range(10n, 20n),
      range(22n, 30n),
    ]);
  });
});

describe("removeCoveredRange", () => {
  it("rolls back an exact range", () => {
    expect(
      removeCoveredRange([range(10n, 20n), range(30n, 40n)], range(30n, 40n)),
    ).toEqual([range(10n, 20n)]);
  });

  it("splits a covering range", () => {
    expect(removeCoveredRange([range(0n, 100n)], range(40n, 60n))).toEqual([
      range(0n, 39n),
      range(61n, 100n),
    ]);
  });
});

describe("insertSeriesSegment", () => {
  const segment = (
    startNs: bigint,
    endNs: bigint,
    times: number[],
    values: number[],
  ) => ({
    endNs,
    startNs,
    timesSec: Float64Array.from(times),
    values: Float64Array.from(values),
  });

  it("keeps segments sorted by range", () => {
    const segments = insertSeriesSegment(
      [segment(40n, 50n, [4], [40])],
      segment(10n, 20n, [1], [10]),
    );
    expect(segments.map((s) => s.startNs)).toEqual([10n, 40n]);
  });

  it("concatenates abutting segments into one", () => {
    const segments = insertSeriesSegment(
      [segment(10n, 20n, [1, 2], [10, 20])],
      segment(21n, 30n, [3], [30]),
    );
    expect(segments).toHaveLength(1);
    expect([...segments[0].timesSec]).toEqual([1, 2, 3]);
    expect([...segments[0].values]).toEqual([10, 20, 30]);
    expect(segments[0].startNs).toBe(10n);
    expect(segments[0].endNs).toBe(30n);
  });

  it("bridges two existing segments when the new one abuts both", () => {
    const segments = insertSeriesSegment(
      [segment(10n, 20n, [1], [1]), segment(31n, 40n, [4], [4])],
      segment(21n, 30n, [2], [2]),
    );
    expect(segments).toHaveLength(1);
    expect([...segments[0].timesSec]).toEqual([1, 2, 4]);
    expect(segments[0].startNs).toBe(10n);
    expect(segments[0].endNs).toBe(40n);
  });
});

describe("flattenSeriesSegments", () => {
  it("returns empty arrays for no segments", () => {
    const flat = flattenSeriesSegments([], []);
    expect(flat.timesSec.length).toBe(0);
    expect(flat.values.length).toBe(0);
  });

  it("passes a single segment through", () => {
    const flat = flattenSeriesSegments(
      [
        {
          endNs: 20n,
          startNs: 10n,
          timesSec: Float64Array.from([1, 2]),
          values: Float64Array.from([10, 20]),
        },
      ],
      [],
    );
    expect([...flat.timesSec]).toEqual([1, 2]);
    expect([...flat.values]).toEqual([10, 20]);
  });

  it("inserts a NaN gap sample between non-abutting segments", () => {
    const flat = flattenSeriesSegments(
      [
        {
          endNs: 20n,
          startNs: 10n,
          timesSec: Float64Array.from([1, 2]),
          values: Float64Array.from([10, 20]),
        },
        {
          endNs: 60n,
          startNs: 50n,
          timesSec: Float64Array.from([5, 6]),
          values: Float64Array.from([50, 60]),
        },
      ],
      [{ endNs: 49n, startNs: 21n }],
    );
    expect([...flat.timesSec]).toEqual([1, 2, 3.5, 5, 6]);
    expect(flat.values[2]).toBeNaN();
    expect([...flat.values.slice(0, 2)]).toEqual([10, 20]);
    expect([...flat.values.slice(3)]).toEqual([50, 60]);
  });

  it("connects non-abutting parts across known-empty coverage", () => {
    const flat = flattenSeriesSegments(
      [
        {
          endNs: 20n,
          startNs: 10n,
          timesSec: Float64Array.from([1, 2]),
          values: Float64Array.from([10, 20]),
        },
        {
          endNs: 60n,
          startNs: 50n,
          timesSec: Float64Array.from([5, 6]),
          values: Float64Array.from([50, 60]),
        },
      ],
      [],
    );

    expect([...flat.timesSec]).toEqual([1, 2, 5, 6]);
    expect([...flat.values]).toEqual([10, 20, 50, 60]);
  });

  it("does not invent a gap between abutting immutable parts", () => {
    const flat = flattenSeriesSegments(
      [
        {
          endNs: 20n,
          startNs: 10n,
          timesSec: Float64Array.from([1, 2]),
          values: Float64Array.from([10, 20]),
        },
        {
          endNs: 30n,
          startNs: 21n,
          timesSec: Float64Array.from([3]),
          values: Float64Array.from([30]),
        },
      ],
      [],
    );

    expect([...flat.timesSec]).toEqual([1, 2, 3]);
    expect([...flat.values]).toEqual([10, 20, 30]);
  });

  it("skips empty segments", () => {
    const flat = flattenSeriesSegments(
      [
        {
          endNs: 20n,
          startNs: 10n,
          timesSec: new Float64Array(0),
          values: new Float64Array(0),
        },
        {
          endNs: 60n,
          startNs: 50n,
          timesSec: Float64Array.from([5]),
          values: Float64Array.from([50]),
        },
      ],
      [],
    );
    expect([...flat.timesSec]).toEqual([5]);
  });
});

describe("numeric-series window policy", () => {
  it("round-trips stream and field cache keys", () => {
    const key = numericSeriesKey("/odom", "twist.linear.x");
    expect(splitNumericSeriesKey(key)).toEqual(["/odom", "twist.linear.x"]);
  });

  it("quantizes the playhead horizon and clamps it to the timeline", () => {
    const timeline = createTimelineIndex({
      endNs: 120_000_000_000n,
      startNs: 0n,
    });

    expect(quantizedNumericSeriesWindow(timeline, 60)).toEqual({
      endNs: 89_999_999_999n,
      startNs: 30_000_000_000n,
    });
    expect(quantizedNumericSeriesWindow(timeline, 5).startNs).toBe(0n);
  });

  it("chooses the nearest missing range deterministically", () => {
    const ranges = [range(10n, 20n), range(40n, 50n)];
    expect(nearestNumericSeriesRange(ranges, 35n)).toEqual(range(40n, 50n));
    expect(nearestNumericSeriesRange(ranges, 30n)).toEqual(range(10n, 20n));
  });

  it("measures clipped coverage and range overlap", () => {
    const horizon = range(10_000_000_000n, 20_000_000_000n);
    expect(
      coveredNumericSeriesSeconds(
        [range(0n, 12_000_000_000n), range(18_000_000_000n, 30_000_000_000n)],
        horizon,
      ),
    ).toBe(4);
    expect(numericSeriesRangeDurationSeconds(horizon)).toBe(10);
    expect(numericSeriesRangesOverlap(range(0n, 10n), range(10n, 20n))).toBe(
      true,
    );
    expect(numericSeriesRangesOverlap(range(0n, 9n), range(10n, 20n))).toBe(
      false,
    );
  });

  it("clips decoded fields and applies proportional point budgets", () => {
    const clipped = sliceNumericFieldToRange(
      {
        bucketIndexes: BigInt64Array.from([0n, 1n, 2n, 3n]),
        timesSec: Float64Array.from([0, 1, 2, 3]),
        values: Float64Array.from([10, 11, 12, 13]),
      },
      0n,
      range(1_000_000_000n, 2_000_000_000n),
    );
    expect(clipped.bucketIndexes).toEqual(BigInt64Array.from([1n, 2n]));
    expect([...clipped.timesSec]).toEqual([1, 2]);
    expect([...clipped.values]).toEqual([11, 12]);
    expect(numericSeriesWindowPointBudget(null, undefined)).toBe(4_000);
    expect(
      numericSeriesWindowPointBudget(range(0n, 60_000_000_000n), 7_200),
    ).toBe(200);
    expect(FULL_NUMERIC_SERIES_COVERAGE).toEqual({
      endNs: 1n << 62n,
      startNs: 0n,
    });
  });
});
