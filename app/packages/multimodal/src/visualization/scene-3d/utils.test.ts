import { describe, expect, it } from "vitest";

import { complementaryRgbUnit } from "./utils";

describe("complementaryRgbUnit", () => {
  it("rotates chromatic colors by 180° preserving lightness", () => {
    // Pure red ↔ pure cyan.
    expect(complementaryRgbUnit([1, 0, 0])).toEqual([0, 1, 1]);
    expect(complementaryRgbUnit([0, 1, 1])).toEqual([1, 0, 0]);
    // Pure green ↔ pure magenta.
    expect(complementaryRgbUnit([0, 1, 0])).toEqual([1, 0, 1]);
  });

  it("round-trips within float tolerance", () => {
    const original: readonly [number, number, number] = [0.8, 0.35, 0.1];
    const roundTripped = complementaryRgbUnit(complementaryRgbUnit(original));
    roundTripped.forEach((component, index) => {
      expect(component).toBeCloseTo(original[index], 5);
    });
  });

  it("inverts lightness for achromatic inputs", () => {
    expect(complementaryRgbUnit([0.25, 0.25, 0.25])).toEqual([
      0.75, 0.75, 0.75,
    ]);
    expect(complementaryRgbUnit([1, 1, 1])).toEqual([0, 0, 0]);
  });

  it("clamps out-of-range inputs instead of overflowing", () => {
    const result = complementaryRgbUnit([2, -1, 0.5]);
    result.forEach((component) => {
      expect(component).toBeGreaterThanOrEqual(0);
      expect(component).toBeLessThanOrEqual(1);
    });
  });
});
