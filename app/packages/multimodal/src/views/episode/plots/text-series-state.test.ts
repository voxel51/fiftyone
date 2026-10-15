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

    expect(state.encode(KEY, field, 0n)).toBe(field.values);
    expect(state.isText(KEY)).toBe(false);
    expect(state.tileKey(KEY)).toBe(KEY);
  });

  it("keeps one code per label across reads and caches text apart", () => {
    const state = createTextSeriesState();

    state.encode(KEY, { ...packed([0], [0]), labels: ["PARK"] }, 0n);
    const second = state.encode(
      KEY,
      { ...packed([1, 2], [0, 1]), labels: ["DRIVE", "PARK"] },
      0n,
    );

    expect([...second]).toEqual([1, 0]);
    expect(state.labels(KEY)).toEqual(["PARK", "DRIVE"]);
    expect(state.isText(KEY)).toBe(true);
    expect(state.tileKey(KEY)).not.toBe(KEY);
  });

  it("treats catalog text fields as text before their first read", () => {
    const state = createTextSeriesState();

    state.noteCatalog([
      {
        availability: "ready",
        encoding: "json",
        fields: [
          { path: "mode", valueType: "string" },
          { path: "speed", valueType: "number" },
        ],
        sourceName: "/drive",
        streamId: "/drive",
      },
    ]);

    expect(state.isText(KEY)).toBe(true);
    expect(state.isText(numericSeriesKey("/drive", "speed"))).toBe(false);
  });

  it("holds the prior state into a horizon with no earlier sample", () => {
    const state = createTextSeriesState();
    state.encode(
      KEY,
      { ...packed([5, 40], [0, 1]), labels: ["SPORT", "DRIVE"] },
      0n,
      30_000_000_000n,
    );

    const held = state.withPrior(KEY, packed([40], [1]), 30_000_000_000n, 30);
    expect([...held.timesSec]).toEqual([5, 40]);
    expect([...held.values]).toEqual([0, 1]);

    // A sample at the horizon start needs no prior, and a prior resolved for
    // an earlier start cannot vouch for a later one.
    const covered = packed([30], [1]);
    expect(state.withPrior(KEY, covered, 30_000_000_000n, 30)).toBe(covered);
    const later = packed([], []);
    expect(state.withPrior(KEY, later, 50_000_000_000n, 50)).toBe(later);
  });
});
