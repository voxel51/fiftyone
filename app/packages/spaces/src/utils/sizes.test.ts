import { describe, expect, it } from "vitest";
import { getRelativeSizes, getAbsoluteSizes, toPercentage } from "./sizes";

describe("getRelativeSizes", () => {
  it("returns correct relative sizes based on provided numerical sizes", () => {
    expect(getRelativeSizes([10, 10])).toEqual([0.5, 0.5]);
    expect(getRelativeSizes([10, 15])).toEqual([0.4, 0.6]);
    expect(getRelativeSizes([15, 10])).toEqual([0.6, 0.4]);
    expect(getRelativeSizes([10])).toEqual([1]);
    expect(getRelativeSizes([10, 10, 10, 10])).toEqual([
      0.25, 0.25, 0.25, 0.25,
    ]);
    // last panel should take remaining size to add up to 100%
    expect(getRelativeSizes([10, 10, 10])).toEqual([0.33, 0.33, 0.34]);
    expect(getRelativeSizes([10, 15, 10, 10])).toEqual([
      0.22, 0.33, 0.22, 0.23,
    ]);
  });
});

describe("getAbsoluteSizes", () => {
  it("returns correct absolute sizes based on provided relative sizes", () => {
    expect(getAbsoluteSizes([0.3, 0.7], 100)).toEqual([30, 70]);
    expect(getAbsoluteSizes([0.7, 0.3], 100)).toEqual([70, 30]);
    // last panel should take remaining size to add up to totalSize
    expect(getAbsoluteSizes([0.7, 1], 100)).toEqual([70, 30]);
  });
});

describe("toPercentage", () => {
  it("converts floating points to percentage correctly", () => {
    expect(toPercentage(0.3)).toBe("30%");
    expect(toPercentage(0.33)).toBe("33%");
    expect(toPercentage(0.333)).toBe("33%");
    expect(toPercentage(0.3333338)).toBe("33%");
    expect(toPercentage(0.335)).toBe("34%");
    expect(toPercentage(0.338)).toBe("34%");
    expect(toPercentage(1)).toBe("100%");
    expect(toPercentage(1.1)).toBe("110%");
  });
});
