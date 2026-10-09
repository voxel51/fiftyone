import { describe, expect, it } from "vitest";
import { maxRowAspect } from "./useZoomSetting";

describe("maxRowAspect", () => {
  it("keeps the widest grids at the full range", () => {
    expect(maxRowAspect(1200)).toBe(15);
    expect(maxRowAspect(2400)).toBe(15);
    expect(maxRowAspect(800)).toBe(10);
  });

  it("narrows rows as the grid thins", () => {
    expect(maxRowAspect(400)).toBe(5);
    expect(maxRowAspect(160)).toBe(2);
    expect(maxRowAspect(40)).toBe(1);
  });
});
