import { describe, expect, it } from "vitest";
import {
  createLocationTrackCursor,
  decimateLocationTrackSegments,
  horizontalAccuracyM,
  indexedLocationTrailCoordinates,
  indexLocationTrack,
  interpolateLocationAtTime,
  isValidLocationPoint,
  locationTrailCoordinates,
  resolveIndexedLocationAtTime,
  segmentLocationTrack,
  type EpisodeLocationTrackPoint,
} from "./location-track";
import { bearingDegrees } from "../wgs84";

function point(
  index: number,
  overrides: Partial<EpisodeLocationTrackPoint> = {},
): EpisodeLocationTrackPoint {
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

  it("keeps the returned segments under the requested render cap", () => {
    const segments = Array.from({ length: 20 }, (_, segmentIndex) => ({
      points: [point(segmentIndex * 2), point(segmentIndex * 2 + 1)],
    }));

    const result = decimateLocationTrackSegments(segments, 10);

    expect(result.truncated).toBe(true);
    expect(result.pointCount).toBe(40);
    expect(
      result.segments.reduce(
        (count, segment) => count + segment.points.length,
        0,
      ),
    ).toBeLessThanOrEqual(10);
    expect(result.segments[0].points[0]).toBe(segments[0].points[0]);
    expect(result.segments[result.segments.length - 1].points.at(-1)).toBe(
      segments[segments.length - 1].points[1],
    );
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

describe("indexed location lookup", () => {
  it("advances a cursor, preserves no-fix gaps, and resets on backwards seeks", () => {
    const segments = segmentLocationTrack([
      point(0),
      point(10),
      point(20, { fixStatus: -1 }),
      point(30),
      point(40),
    ]);
    const indexed = indexLocationTrack(segments);
    const cursor = createLocationTrackCursor();

    const first = resolveIndexedLocationAtTime(indexed, 5_000_000_000n, cursor);
    expect(first.state).toBe("active");
    expect(first.segmentIndex).toBe(0);
    expect(first.location?.latitude).toBeCloseTo(37.005);

    const gap = resolveIndexedLocationAtTime(indexed, 20_000_000_000n, cursor);
    expect(gap).toMatchObject({
      boundarySegmentIndex: 1,
      location: null,
      segmentIndex: null,
      state: "gap",
    });

    const second = resolveIndexedLocationAtTime(
      indexed,
      35_000_000_000n,
      cursor,
    );
    expect(second.state).toBe("active");
    expect(second.segmentIndex).toBe(1);

    const backwards = resolveIndexedLocationAtTime(
      indexed,
      2_500_000_000n,
      cursor,
    );
    expect(backwards.state).toBe("active");
    expect(backwards.segmentIndex).toBe(0);
    expect(backwards.location?.latitude).toBeCloseTo(37.0025);
  });

  it("resolves before/after states and geometric line progress", () => {
    const segments = segmentLocationTrack([
      point(0, { latitude: 0, longitude: 0 }),
      point(9, { latitude: 0, longitude: 0.001 }),
      point(10, { latitude: 0, longitude: 0.002 }),
    ]);
    const indexed = indexLocationTrack(segments);

    expect(resolveIndexedLocationAtTime(indexed, -1n)).toMatchObject({
      boundarySegmentIndex: 0,
      state: "before",
    });
    const active = resolveIndexedLocationAtTime(indexed, 9_500_000_000n);
    expect(active.state).toBe("active");
    expect(active.lineProgress).toBeCloseTo(0.75, 2);
    expect(
      resolveIndexedLocationAtTime(indexed, 11_000_000_000n),
    ).toMatchObject({
      boundarySegmentIndex: 1,
      state: "after",
    });
  });

  it("builds the same bounded trail without scanning other segments", () => {
    const segments = segmentLocationTrack(
      Array.from({ length: 11 }, (_, index) => point(index)),
    );
    const timeNs = 5_250_000_000n;
    const windowNs = 2_500_000_000n;
    const indexed = indexLocationTrack(segments);
    const resolved = resolveIndexedLocationAtTime(indexed, timeNs);

    expect(
      indexedLocationTrailCoordinates(indexed, resolved, windowNs),
    ).toEqual(locationTrailCoordinates(segments, timeNs, windowNs));
  });

  it("freezes the indexed trail at the final fix after the track", () => {
    const segments = segmentLocationTrack(
      Array.from({ length: 6 }, (_, index) => point(index)),
    );
    const indexed = indexLocationTrack(segments);
    const resolved = resolveIndexedLocationAtTime(indexed, 10_000_000_000n);

    expect(resolved.state).toBe("after");
    expect(
      indexedLocationTrailCoordinates(indexed, resolved, 2_500_000_000n),
    ).toEqual(
      locationTrailCoordinates(segments, 5_000_000_000n, 2_500_000_000n),
    );
  });

  it("does not build an indexed trail before a track or inside a gap", () => {
    const segments = segmentLocationTrack([
      point(0),
      point(1),
      point(2, { fixStatus: -1 }),
      point(3),
      point(4),
    ]);
    const indexed = indexLocationTrack(segments);
    const before = resolveIndexedLocationAtTime(indexed, -1n);
    const gap = resolveIndexedLocationAtTime(indexed, 2_500_000_000n);

    expect(before.state).toBe("before");
    expect(gap.state).toBe("gap");
    expect(
      indexedLocationTrailCoordinates(indexed, before, 2_000_000_000n),
    ).toEqual([]);
    expect(
      indexedLocationTrailCoordinates(indexed, gap, 2_000_000_000n),
    ).toEqual([]);
  });

  it("resolves large forward seeks across segments and points", () => {
    const segmented = indexLocationTrack(
      Array.from({ length: 200 }, (_, segmentIndex) => ({
        points: [point(segmentIndex * 10), point(segmentIndex * 10 + 1)],
      })),
    );
    const segmentCursor = createLocationTrackCursor();
    resolveIndexedLocationAtTime(segmented, 0n, segmentCursor);
    const distantSegment = resolveIndexedLocationAtTime(
      segmented,
      1_500_500_000_000n,
      segmentCursor,
    );
    expect(distantSegment.segmentIndex).toBe(150);
    expect(distantSegment.location?.latitude).toBeCloseTo(38.5005);

    const longSegment = indexLocationTrack([
      { points: Array.from({ length: 1_000 }, (_, index) => point(index)) },
    ]);
    const pointCursor = createLocationTrackCursor();
    resolveIndexedLocationAtTime(longSegment, 0n, pointCursor);
    const distantPoint = resolveIndexedLocationAtTime(
      longSegment,
      900_500_000_000n,
      pointCursor,
    );
    expect(distantPoint.pointIndex).toBe(900);
    expect(distantPoint.location?.latitude).toBeCloseTo(37.9005);
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
