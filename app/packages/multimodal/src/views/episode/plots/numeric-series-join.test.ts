import { describe, expect, it } from "vitest";
import { decimateMinMax } from "../../../adapters/mcap/resource-client/numeric-series-decimate";
import { joinNumericSeries } from "./numeric-series-join";

describe("joinNumericSeries", () => {
  it("returns empty vectors for no series", () => {
    const joined = joinNumericSeries([]);
    expect(joined.xs).toEqual([]);
    expect(joined.ys).toEqual([]);
  });

  it("aligns series with identical timestamps", () => {
    const joined = joinNumericSeries([
      {
        timesSec: Float64Array.from([0, 1, 2]),
        values: Float64Array.from([10, 11, 12]),
      },
      {
        timesSec: Float64Array.from([0, 1, 2]),
        values: Float64Array.from([20, 21, 22]),
      },
    ]);
    expect(joined.xs).toEqual([0, 1, 2]);
    expect(joined.ys).toEqual([
      [10, 11, 12],
      [20, 21, 22],
    ]);
  });

  it("uses undefined for alignment-only missing samples", () => {
    const joined = joinNumericSeries([
      {
        timesSec: Float64Array.from([0, 2]),
        values: Float64Array.from([1, 3]),
      },
      {
        timesSec: Float64Array.from([1, 2]),
        values: Float64Array.from([7, 8]),
      },
    ]);
    expect(joined.xs).toEqual([0, 1, 2]);
    expect(joined.ys).toEqual([
      [1, undefined, 3],
      [undefined, 7, 8],
    ]);
  });

  it("keeps real gaps distinct from alignment-only missing samples", () => {
    const joined = joinNumericSeries([
      {
        timesSec: Float64Array.from([0, 2, 4]),
        values: Float64Array.from([1, Number.NaN, 3]),
      },
      {
        timesSec: Float64Array.from([1, 3]),
        values: Float64Array.from([7, 8]),
      },
    ]);

    expect(joined.xs).toEqual([0, 1, 2, 3, 4]);
    expect(joined.ys).toEqual([
      [1, undefined, null, undefined, 3],
      [undefined, 7, undefined, 8, undefined],
    ]);
  });

  it("converts NaN gap markers to null", () => {
    const joined = joinNumericSeries([
      {
        timesSec: Float64Array.from([0, 1, 2]),
        values: Float64Array.from([1, Number.NaN, 3]),
      },
    ]);
    expect(joined.ys[0]).toEqual([1, null, 3]);
  });

  it("keeps finite samples over gap markers at duplicate timestamps", () => {
    const joined = joinNumericSeries([
      {
        timesSec: Float64Array.from([0, 0, 1, 1, 2, 2]),
        values: Float64Array.from([1, Number.NaN, Number.NaN, 2, 3, 4]),
      },
    ]);

    expect(joined.xs).toEqual([0, 1, 2]);
    expect(joined.ys[0]).toEqual([1, 2, 4]);
  });

  it("renders a mixed-bucket decimation gap as visible separation", () => {
    const times = Float64Array.from({ length: 100 }, (_, index) => index);
    const values = Float64Array.from({ length: 100 }, () => 1);
    values[50] = Number.NaN;
    const decimated = decimateMinMax(times, values, 10);

    const joined = joinNumericSeries([
      { timesSec: decimated.times, values: decimated.values },
    ]);
    const gapIndex = joined.ys[0].indexOf(null);

    expect(gapIndex).toBeGreaterThan(0);
    expect(gapIndex).toBeLessThan(joined.ys[0].length - 1);
    expect(joined.ys[0].slice(0, gapIndex).some(Number.isFinite)).toBe(true);
    expect(joined.ys[0].slice(gapIndex + 1).some(Number.isFinite)).toBe(true);
  });

  it("merges unsorted overlaps into ascending unique x values", () => {
    const joined = joinNumericSeries([
      {
        timesSec: Float64Array.from([5, 10]),
        values: Float64Array.from([1, 2]),
      },
      {
        timesSec: Float64Array.from([1, 5]),
        values: Float64Array.from([3, 4]),
      },
    ]);
    expect(joined.xs).toEqual([1, 5, 10]);
    expect(joined.ys).toEqual([
      [undefined, 1, 2],
      [3, 4, undefined],
    ]);
  });
});
