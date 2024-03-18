import { describe, expect, it } from "vitest";
import { getRelativeSizes, getAbsoluteSizes } from "./sizes";

describe("getRelativeSizes", () => {
  it("returns correct relative sizes based on provided numerical sizes", () => {
    expect(getRelativeSizes([10, 10])).toEqual(["50%", "50%"]);
    expect(getRelativeSizes([10, 15])).toEqual(["40%", "60%"]);
    expect(getRelativeSizes([15, 10])).toEqual(["60%", "40%"]);
    expect(getRelativeSizes([10])).toEqual(["100%"]);
    // last panel should take remaining size to add up to 100%
    expect(getRelativeSizes([10, 10, 10])).toEqual(["33%", "33%", "34%"]);
    expect(getRelativeSizes([10, 10, 10, 10])).toEqual([
      "25%",
      "25%",
      "25%",
      "25%",
    ]);
    expect(getRelativeSizes([10, 15, 10, 10])).toEqual([
      "22%",
      "33%",
      "22%",
      "23%",
    ]);
  });
});

describe("getAbsoluteSizes", () => {
  it("returns correct absolute sizes based on provided relative sizes", () => {
    expect(getAbsoluteSizes(["30%", "70%"], 100)).toEqual([30, 70]);
    expect(getAbsoluteSizes(["70%", "30%"], 100)).toEqual([70, 30]);
    // last panel should take remaining size to add up to totalSize
    expect(getAbsoluteSizes(["70%", "100%"], 100)).toEqual([70, 30]);
  });
});
