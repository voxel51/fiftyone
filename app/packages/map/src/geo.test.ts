import { describe, expect, it } from "vitest";
import { filterValidSampleLocations, isValidCoordinate } from "./geo";

describe("isValidCoordinate", () => {
  it("accepts coordinates within bounds", () => {
    expect(isValidCoordinate([-73.968285, 40.785091])).toBe(true);
    expect(isValidCoordinate([0, 0])).toBe(true);
  });

  it("accepts boundary values", () => {
    expect(isValidCoordinate([180, 90])).toBe(true);
    expect(isValidCoordinate([-180, -90])).toBe(true);
  });

  it("rejects out-of-range longitude", () => {
    expect(isValidCoordinate([500, 0])).toBe(false);
    expect(isValidCoordinate([-181, 0])).toBe(false);
  });

  it("rejects out-of-range latitude", () => {
    expect(isValidCoordinate([0, 999])).toBe(false);
    expect(isValidCoordinate([0, -91])).toBe(false);
  });

  it("rejects non-finite values", () => {
    expect(isValidCoordinate([NaN, 0])).toBe(false);
    expect(isValidCoordinate([0, Infinity])).toBe(false);
  });
});

describe("filterValidSampleLocations", () => {
  it("drops only the samples with invalid coordinates", () => {
    const input = {
      valid1: [-73.968285, 40.785091] as [number, number],
      invalidLng: [500, 0] as [number, number],
      invalidLat: [0, 999] as [number, number],
      valid2: [0, 0] as [number, number],
    };

    expect(filterValidSampleLocations(input)).toEqual({
      valid1: [-73.968285, 40.785091],
      valid2: [0, 0],
    });
  });

  it("returns an empty object when nothing is valid", () => {
    const input = { bad: [500, 999] as [number, number] };
    expect(filterValidSampleLocations(input)).toEqual({});
  });

  it("returns an empty object for an empty input", () => {
    expect(filterValidSampleLocations({})).toEqual({});
  });
});
