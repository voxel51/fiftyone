import { describe, expect, it } from "vitest";
import { MISSING_CATEGORY } from "./colors";
import { legendCounts } from "./legendCounts";

// Points: cat, dog, cat, missing, dog, cat
const COLUMN = new Uint16Array([0, 1, 0, MISSING_CATEGORY, 1, 0]);

describe("legendCounts", () => {
  it("returns null when there is no selection and no scope", () => {
    expect(legendCounts(COLUMN, 2, null, null)).toBeNull();
    expect(legendCounts(COLUMN, 2, [], null)).toBeNull();
  });

  it("tallies the selection, ignoring missing values", () => {
    expect(legendCounts(COLUMN, 2, [0, 1, 3], null)).toEqual([1, 1]);
  });

  it("prefers the selection over the scope mask", () => {
    const scope = new Uint8Array([1, 1, 1, 1, 1, 1]);
    expect(legendCounts(COLUMN, 2, [5], scope)).toEqual([1, 0]);
  });

  it("tallies the scope mask when nothing is selected", () => {
    const scope = new Uint8Array([1, 0, 1, 1, 0, 1]);
    expect(legendCounts(COLUMN, 2, null, scope)).toEqual([3, 0]);
  });

  it("ignores class indices past a truncated legend's list", () => {
    // Column knows class 2; the legend only lists top-2
    const column = new Uint16Array([0, 1, 2]);
    expect(legendCounts(column, 2, [0, 1, 2], null)).toEqual([1, 1]);
  });

  it("survives a scope mask shorter than the column", () => {
    expect(legendCounts(COLUMN, 2, null, new Uint8Array([1, 1]))).toEqual([
      1, 1,
    ]);
  });
});
