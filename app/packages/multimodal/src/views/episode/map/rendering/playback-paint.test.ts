import { describe, expect, it } from "vitest";

import type { LocationTrackState } from "../tracks/location-track";
import { mapPlaybackFrameAt, prunePlaybackPaintState } from "./playback-paint";
import { createIndexedMapTrack } from "./route-layers";

describe("map playback paint", () => {
  it("resolves forward and backward seeks with the reusable track cursor", () => {
    const indexed = createIndexedMapTrack(createTrack());
    const cursors = new Map();

    const forward = mapPlaybackFrameAt([indexed], 8n, cursors);
    const backward = mapPlaybackFrameAt([indexed], 2n, cursors);

    expect(forward.markers[0]?.location.longitude).toBeCloseTo(8);
    expect(backward.markers[0]?.location.longitude).toBeCloseTo(2);
    expect(backward.resolutions.get(indexed.key)?.state).toBe("active");
    expect(backward.comets[0]?.coordinates.length).toBeGreaterThan(0);
  });

  it("prunes cursor and filter state for removed tracks", () => {
    const kept = createIndexedMapTrack(createTrack());
    const state = {
      cursors: new Map([
        [kept.key, { pointIndex: 0, segmentIndex: 0, timeNs: 0n }],
        ["removed", { pointIndex: 0, segmentIndex: 0, timeNs: 0n }],
      ]),
      routeProgressKeys: new Map([
        [kept.key, "kept"],
        ["removed", "removed"],
      ]),
    };

    prunePlaybackPaintState(state, [kept]);

    expect([...state.cursors.keys()]).toEqual([kept.key]);
    expect([...state.routeProgressKeys.keys()]).toEqual([kept.key]);
  });
});

function createTrack(): LocationTrackState {
  return {
    color: "#ff6600",
    label: "GPS",
    pointCount: 2,
    segments: [
      {
        points: [
          { latitude: 0, longitude: 0, timeNs: 0n },
          { latitude: 10, longitude: 10, timeNs: 10n },
        ],
      },
    ],
    status: "ready",
    stream: "/gps",
  };
}
