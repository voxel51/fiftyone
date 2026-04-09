import { describe, expect, it } from "vitest";
import { clampTime, isInRange, quantize, sequenceRange } from "./TimeValue";

describe("quantize", () => {
  it("rounds to nearest integer for sequence type", () => {
    expect(quantize(1.4, "sequence")).toBe(1);
    expect(quantize(1.5, "sequence")).toBe(2);
    expect(quantize(1.6, "sequence")).toBe(2);
    expect(quantize(10.0, "sequence")).toBe(10);
  });

  it("floors to integer for duration type", () => {
    expect(quantize(1.9, "duration")).toBe(1);
    expect(quantize(1.1, "duration")).toBe(1);
    expect(quantize(1.0, "duration")).toBe(1);
    expect(quantize(0.999, "duration")).toBe(0);
  });

  it("floors to integer for timestamp type", () => {
    expect(quantize(1000.7, "timestamp")).toBe(1000);
    expect(quantize(0.1, "timestamp")).toBe(0);
  });

  it("handles negative values", () => {
    expect(quantize(-1.5, "sequence")).toBe(-1);
    expect(quantize(-1.9, "duration")).toBe(-2);
  });

  it("handles zero", () => {
    expect(quantize(0, "sequence")).toBe(0);
    expect(quantize(0, "duration")).toBe(0);
  });
});

describe("clampTime", () => {
  it("returns value when within range", () => {
    expect(clampTime(5, [1, 10])).toBe(5);
    expect(clampTime(1, [1, 10])).toBe(1);
    expect(clampTime(10, [1, 10])).toBe(10);
  });

  it("clamps to minimum when below range", () => {
    expect(clampTime(0, [1, 10])).toBe(1);
    expect(clampTime(-5, [1, 10])).toBe(1);
  });

  it("clamps to maximum when above range", () => {
    expect(clampTime(15, [1, 10])).toBe(10);
    expect(clampTime(100, [1, 10])).toBe(10);
  });

  it("handles single-value range", () => {
    expect(clampTime(0, [5, 5])).toBe(5);
    expect(clampTime(5, [5, 5])).toBe(5);
    expect(clampTime(10, [5, 5])).toBe(5);
  });
});

describe("isInRange", () => {
  it("returns true for values within range (inclusive)", () => {
    expect(isInRange(5, [1, 10])).toBe(true);
    expect(isInRange(1, [1, 10])).toBe(true);
    expect(isInRange(10, [1, 10])).toBe(true);
  });

  it("returns false for values outside range", () => {
    expect(isInRange(0, [1, 10])).toBe(false);
    expect(isInRange(11, [1, 10])).toBe(false);
    expect(isInRange(-1, [1, 10])).toBe(false);
  });

  it("handles single-value range", () => {
    expect(isInRange(5, [5, 5])).toBe(true);
    expect(isInRange(4, [5, 5])).toBe(false);
    expect(isInRange(6, [5, 5])).toBe(false);
  });
});

describe("sequenceRange", () => {
  it("returns [1, totalFrames]", () => {
    expect(sequenceRange(100)).toEqual([1, 100]);
    expect(sequenceRange(1)).toEqual([1, 1]);
    expect(sequenceRange(50)).toEqual([1, 50]);
  });

  it("returns a readonly tuple (as const)", () => {
    const range = sequenceRange(10);
    expect(range).toEqual([1, 10]);
    expect(range.length).toBe(2);
  });
});
