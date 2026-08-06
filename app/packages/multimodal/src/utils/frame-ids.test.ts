import { describe, expect, it } from "vitest";
import { compareFrameIds, uniqueSortedFrameIds } from "./frame-ids";

describe("frame id utilities", () => {
  it("normalizes frame ids consistently", () => {
    expect(
      uniqueSortedFrameIds([" child ", "", "base", "child", "  "]),
    ).toEqual(["base", "child"]);
  });

  it("compares frame ids in stable lexical order", () => {
    expect(compareFrameIds("base", "child")).toBe(-1);
    expect(compareFrameIds("child", "base")).toBe(1);
    expect(compareFrameIds("base", "base")).toBe(0);
  });
});
