import { describe, expect, it } from "vitest";
import { isValueWithinRange } from "./skeletonFilter";

describe("isValueWithinRange", () => {
  it("treats a null maximum as unbounded", () => {
    expect(isValueWithinRange(0.3, [0.2, null])).toBe(true);
    expect(isValueWithinRange(0.1, [0.2, null])).toBe(false);
  });

  it("treats a null minimum as unbounded", () => {
    expect(isValueWithinRange(0.3, [null, 0.4])).toBe(true);
    expect(isValueWithinRange(0.5, [null, 0.4])).toBe(false);
  });

  it("treats two null bounds as unbounded", () => {
    expect(isValueWithinRange(0.5, [null, null])).toBe(true);
  });

  it("includes values at finite boundaries", () => {
    expect(isValueWithinRange(0.2, [0.2, 0.4])).toBe(true);
    expect(isValueWithinRange(0.4, [0.2, 0.4])).toBe(true);
    expect(isValueWithinRange(0.1, [0.2, 0.4])).toBe(false);
    expect(isValueWithinRange(0.5, [0.2, 0.4])).toBe(false);
  });
});
