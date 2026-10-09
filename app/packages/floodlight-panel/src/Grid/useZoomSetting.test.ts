import { describe, expect, it } from "vitest";
import { maxRowAspect } from "./useZoomSetting";

describe("maxRowAspect", () => {
  it("keeps the widest grids at the full range", () => {
    expect(maxRowAspect(2400)).toBe(15);
    expect(maxRowAspect(3200)).toBe(15);
    expect(maxRowAspect(1600)).toBe(10);
  });

  it("narrows rows as the grid thins", () => {
    expect(maxRowAspect(520)).toBe(3.25);
    expect(maxRowAspect(320)).toBe(2);
    expect(maxRowAspect(80)).toBe(1);
  });
});
