import { describe, expect, it } from "vitest";
import { numericSeriesKey } from "../../../runtime";
import { createTextSeriesState } from "./text-series-state";

const KEY = numericSeriesKey("/drive", "mode");

function packed(timesSec: number[], values: number[]) {
  return {
    timesSec: Float64Array.from(timesSec),
    values: Float64Array.from(values),
  };
}

describe("createTextSeriesState", () => {
  it("passes numeric series through untouched", () => {
    const state = createTextSeriesState();
    const field = packed([0, 1], [3, 4]);

    expect(state.encode(KEY, field)).toBe(field.values);
    expect(state.tileKey(KEY)).toBe(KEY);
  });

  it("keeps one code per label across reads and caches text apart", () => {
    const state = createTextSeriesState();

    state.encode(KEY, { ...packed([0], [0]), labels: ["PARK"] });
    const second = state.encode(KEY, {
      ...packed([1, 2], [0, 1]),
      labels: ["DRIVE", "PARK"],
    });

    expect([...second]).toEqual([1, 0]);
    expect(state.labels(KEY)).toEqual(["PARK", "DRIVE"]);
    expect(state.tileKey(KEY)).not.toBe(KEY);
  });
});
