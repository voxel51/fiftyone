import { describe, expect, it } from "vitest";
import {
  decimateLocationTrackSegments,
  horizontalAccuracyM,
  interpolateLocationAtTime,
  isValidLocationPoint,
  locationTrailCoordinates,
  segmentLocationTrack,
  type McapLocationTrackPoint,
} from "./mcap-location-track";
import { bearingDegrees } from "./wgs84";

function point(
  index: number,
  overrides: Partial<McapLocationTrackPoint> = {},
): McapLocationTrackPoint {
  return {
    latitude: 37 + index * 0.001,
    longitude: -122 - index * 0.001,
    timeNs: BigInt(index) * 1_000_000_000n,
    ...overrides,
  };
}

describe("isValidLocationPoint", () => {
  it("rejects impossible coordinates and explicit no-fix statuses", () => {
    expect(isValidLocationPoint(point(0))).toBe(true);
    expect(isValidLocationPoint(point(0, { latitude: 100 }))).toBe(false);
    expect(isValidLocationPoint(point(0, { longitude: Number.NaN }))).toBe(
      false,
    );
    expect(isValidLocationPoint(point(0, { fixStatus: -1 }))).toBe(false);
  });
});

describe("segmentLocationTrack", () => {
  it("breaks the route at invalid fixes without interpolating over them", () => {
    const segments = segmentLocationTrack([
      point(0),
      point(1),
      point(2, { fixStatus: -1 }),
      point(3),
      point(4),
    ]);

    expect(
      segments.map((segment) => segment.points.map((p) => p.timeNs)),
    ).toEqual([
      [0n, 1_000_000_000n],
      [3_000_000_000n, 4_000_000_000n],
    ]);
    expect(interpolateLocationAtTime(segments, 2_000_000_000n)).toBeNull();
  });
});

describe("decimateLocationTrackSegments", () => {
  it("uses a global stride and keeps segment endpoints", () => {
    const segments = segmentLocationTrack(
      Array.from({ length: 101 }, (_, index) => point(index)),
    );
    const result = decimateLocationTrackSegments(segments, 11);

    expect(result.truncated).toBe(true);
    expect(result.pointCount).toBe(101);
    expect(result.segments[0].points).toHaveLength(11);
    expect(result.segments[0].points[0]).toBe(segments[0].points[0]);
    expect(result.segments[0].points[10]).toBe(segments[0].points[100]);
  });
});

describe("interpolateLocationAtTime", () => {
  it("interpolates coordinates within a valid GPS segment", () => {
    const segments = segmentLocationTrack([
      point(0, {
        accuracyM: 4,
        altitude: 10,
        latitude: 37,
        longitude: -122,
      }),
      point(10, {
        accuracyM: 8,
        altitude: 20,
        latitude: 38,
        longitude: -123,
      }),
    ]);

    const location = interpolateLocationAtTime(segments, 5_000_000_000n);

    expect(location?.latitude).toBeCloseTo(37.5);
    expect(location?.longitude).toBeCloseTo(-122.5);
    expect(location?.altitude).toBeCloseTo(15);
    expect(location?.accuracyM).toBeCloseTo(6);
    expect(location?.bearingDeg).toBeDefined();
  });
});

describe("horizontalAccuracyM", () => {
  it("is twice the worst-axis standard deviation", () => {
    // Diagonal: worst axis is north (variance 9 → σ 3).
    expect(horizontalAccuracyM([4, 0, 0, 0, 9, 0, 0, 0, 1])).toBeCloseTo(6);
    // Correlated: eigenvalue (4+4)/2 + √(0+3²) = 7.
    expect(horizontalAccuracyM([4, 3, 0, 3, 4, 0, 0, 0, 1])).toBeCloseTo(
      2 * Math.sqrt(7),
    );
  });

  it("treats degenerate matrices as no estimate", () => {
    expect(horizontalAccuracyM(undefined)).toBeUndefined();
    expect(horizontalAccuracyM([1, 2, 3])).toBeUndefined();
    expect(horizontalAccuracyM([0, 0, 0, 0, 0, 0, 0, 0, 0])).toBeUndefined();
    expect(horizontalAccuracyM([-1, 0, 0, 0, 4, 0, 0, 0, 1])).toBeUndefined();
    expect(
      horizontalAccuracyM([Number.NaN, 0, 0, 0, 4, 0, 0, 0, 1]),
    ).toBeUndefined();
  });
});

describe("locationTrailCoordinates", () => {
  it("clips the trail to the window and interpolates both endpoints", () => {
    const segments = segmentLocationTrack(
      Array.from({ length: 11 }, (_, index) => point(index)),
    );

    const coords = locationTrailCoordinates(
      segments,
      5_250_000_000n,
      2_500_000_000n,
    );

    expect(coords).toHaveLength(5);
    expect(coords[0][1]).toBeCloseTo(37.00275);
    expect(coords[coords.length - 1][1]).toBeCloseTo(37.00525);
  });

  it("vanishes in no-fix gaps and freezes past the end of the track", () => {
    const segments = segmentLocationTrack([
      point(0),
      point(1),
      point(2, { fixStatus: -1 }),
      point(3),
      point(4),
    ]);

    expect(
      locationTrailCoordinates(segments, 2_000_000_000n, 5_000_000_000n),
    ).toEqual([]);

    const frozen = locationTrailCoordinates(
      segments,
      60_000_000_000n,
      1_500_000_000n,
    );
    expect(frozen.length).toBeGreaterThanOrEqual(2);
    expect(frozen[frozen.length - 1][1]).toBeCloseTo(37.004);
  });
});

describe("bearingDegrees", () => {
  it("returns geographic bearing clockwise from north", () => {
    expect(
      bearingDegrees(
        { latitude: 0, longitude: 0 },
        { latitude: 1, longitude: 0 },
      ),
    ).toBeCloseTo(0);
    expect(
      bearingDegrees(
        { latitude: 0, longitude: 0 },
        { latitude: 0, longitude: 1 },
      ),
    ).toBeCloseTo(90);
  });
});
