import { describe, expect, it } from "vitest";
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

  it("null-fills where a series has no sample", () => {
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
      [1, null, 3],
      [null, 7, 8],
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
      [null, 1, 2],
      [3, 4, null],
    ]);
  });
});
