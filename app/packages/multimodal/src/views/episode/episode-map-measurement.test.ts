import { describe, expect, it } from "vitest";
import {
  formatMapMeasurementDistance,
  mapMeasurementDistance,
  nextMapMeasurementState,
} from "./episode-map-measurement";
import { haversineDistanceMeters } from "./wgs84";

describe("mcap map measurement", () => {
  it("advances a two-click measurement and restarts after completion", () => {
    const first = nextMapMeasurementState(null, {
      latitude: 37,
      longitude: -122,
    });
    expect(first).toEqual({
      a: { latitude: 37, longitude: -122 },
      b: null,
    });

    const complete = nextMapMeasurementState(first, {
      latitude: 38,
      longitude: -123,
    });
    expect(complete).toEqual({
      a: { latitude: 37, longitude: -122 },
      b: { latitude: 38, longitude: -123 },
    });

    const restarted = nextMapMeasurementState(complete, {
      latitude: 39,
      longitude: -124,
    });
    expect(restarted).toEqual({
      a: { latitude: 39, longitude: -124 },
      b: null,
    });
  });

  it("measures complete WGS84 pairs with great-circle distance", () => {
    expect(mapMeasurementDistance(null)).toBeNull();
    expect(
      mapMeasurementDistance({ a: { latitude: 0, longitude: 0 }, b: null }),
    ).toBeNull();

    expect(
      haversineDistanceMeters(
        { latitude: 0, longitude: 0 },
        { latitude: 0, longitude: 1 },
      ),
    ).toBeCloseTo(111_195, -1);
  });

  it("formats map-scale distances", () => {
    expect(formatMapMeasurementDistance(12.345)).toBe("12.35 m");
    expect(formatMapMeasurementDistance(123.45)).toBe("123.5 m");
    expect(formatMapMeasurementDistance(1_234.5)).toBe("1.23 km");
    expect(formatMapMeasurementDistance(123_456)).toBe("123.5 km");
  });
});
