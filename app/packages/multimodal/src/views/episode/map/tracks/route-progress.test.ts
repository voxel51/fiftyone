import { describe, expect, it } from "vitest";
import type { ResolvedLocationTrackPosition } from "./location-track";
import { episodeMapRouteProgressFilters } from "./route-progress";

function resolved(
  overrides: Partial<ResolvedLocationTrackPosition>,
): ResolvedLocationTrackPosition {
  return {
    boundarySegmentIndex: 0,
    lineProgress: null,
    location: null,
    pointIndex: null,
    segmentIndex: null,
    state: "before",
    ...overrides,
  };
}

describe("episodeMapRouteProgressFilters", () => {
  it("shows every segment as future before the track", () => {
    expect(episodeMapRouteProgressFilters(resolved({}))).toMatchObject({
      active: ["==", ["get", "segmentIndex"], -1],
      future: [">=", ["get", "segmentIndex"], 0],
      past: ["<", ["get", "segmentIndex"], 0],
    });
  });

  it("isolates the active segment from fully past and future segments", () => {
    expect(
      episodeMapRouteProgressFilters(
        resolved({
          boundarySegmentIndex: 2,
          lineProgress: 0.4,
          segmentIndex: 2,
          state: "active",
        }),
      ),
    ).toMatchObject({
      active: ["==", ["get", "segmentIndex"], 2],
      future: [">", ["get", "segmentIndex"], 2],
      past: ["<", ["get", "segmentIndex"], 2],
    });
  });

  it("keeps no-fix gaps disconnected at the next segment boundary", () => {
    expect(
      episodeMapRouteProgressFilters(
        resolved({ boundarySegmentIndex: 2, state: "gap" }),
      ),
    ).toMatchObject({
      active: ["==", ["get", "segmentIndex"], -1],
      future: [">=", ["get", "segmentIndex"], 2],
      past: ["<", ["get", "segmentIndex"], 2],
    });
  });
});
