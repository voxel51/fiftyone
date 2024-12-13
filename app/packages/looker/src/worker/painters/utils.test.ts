import { describe, expect, it } from "vitest";
import { clampedIndex } from "./utils";

describe("heatmap utils", () => {
  it("clamps for heatmaps", async () => {
    // A value below a heatmap range returns -1
    expect(clampedIndex(1, 2, 3, 4)).toBe(-1);

    // A value above a heatmap range return the max
    expect(clampedIndex(4, 2, 3, 4)).toBe(3);
  });
});
