import { describe, expect, it } from "vitest";
import {
  lowerBoundBigInt,
  maxBigInt,
  maxBigIntPair,
  minBigInt,
  minBigIntPair,
} from "./bigint";

describe("bigint utilities", () => {
  it("selects pairwise and array extrema", () => {
    expect(minBigIntPair(3n, -2n)).toBe(-2n);
    expect(maxBigIntPair(3n, -2n)).toBe(3n);
    expect(minBigInt([5n, -2n, 9n, -2n])).toBe(-2n);
    expect(maxBigInt([5n, -2n, 9n, 9n])).toBe(9n);
  });

  it("rejects empty extrema inputs explicitly", () => {
    expect(() => minBigInt([])).toThrow("Expected at least one bigint value");
    expect(() => maxBigInt([])).toThrow("Expected at least one bigint value");
  });

  it("finds lower bounds at edges and across duplicates", () => {
    const values = [1n, 3n, 3n, 8n];
    expect(lowerBoundBigInt(values, 0n)).toBe(0);
    expect(lowerBoundBigInt(values, 3n)).toBe(1);
    expect(lowerBoundBigInt(values, 4n)).toBe(3);
    expect(lowerBoundBigInt(values, 9n)).toBe(4);
    expect(lowerBoundBigInt([], 3n)).toBe(0);
  });
});
