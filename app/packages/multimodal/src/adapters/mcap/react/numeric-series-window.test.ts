import { describe, expect, it } from "vitest";
import {
  addCoveredRange,
  flattenSeriesSegments,
  insertSeriesSegment,
  removeCoveredRange,
  subtractCoveredRanges,
  type NsRange,
} from "./numeric-series-window";

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
    const flat = flattenSeriesSegments([]);
    expect(flat.timesSec.length).toBe(0);
    expect(flat.values.length).toBe(0);
  });

  it("passes a single segment through", () => {
    const flat = flattenSeriesSegments([
      {
        endNs: 20n,
        startNs: 10n,
        timesSec: Float64Array.from([1, 2]),
        values: Float64Array.from([10, 20]),
      },
    ]);
    expect([...flat.timesSec]).toEqual([1, 2]);
    expect([...flat.values]).toEqual([10, 20]);
  });

  it("inserts a NaN gap sample between non-abutting segments", () => {
    const flat = flattenSeriesSegments([
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
    ]);
    expect([...flat.timesSec]).toEqual([1, 2, 3.5, 5, 6]);
    expect(flat.values[2]).toBeNaN();
    expect([...flat.values.slice(0, 2)]).toEqual([10, 20]);
    expect([...flat.values.slice(3)]).toEqual([50, 60]);
  });

  it("skips empty segments", () => {
    const flat = flattenSeriesSegments([
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
    ]);
    expect([...flat.timesSec]).toEqual([5]);
  });
});
