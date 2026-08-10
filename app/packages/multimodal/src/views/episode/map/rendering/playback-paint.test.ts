import { describe, expect, it } from "vitest";

import type { LocationTrackState } from "../tracks/location-track";
import {
  mapPlaybackFrameAt,
  prunePlaybackPaintState,
  withLiveMapMarkers,
} from "./playback-paint";
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

  it("uses exact current-frame markers while route history is incomplete", () => {
    const indexed = createIndexedMapTrack(createTrack());
    const routeFrame = mapPlaybackFrameAt([indexed], 8n, new Map());
    const live = {
      color: "#fff",
      label: "live gps",
      location: { latitude: 10, longitude: 20, timeNs: 8n },
      stream: "/gps",
    };

    const frame = withLiveMapMarkers(routeFrame, [live]);

    expect(frame.markers).toEqual([
      {
        ...live,
        location: {
          ...live.location,
          bearingDeg: routeFrame.markers[0]?.location.bearingDeg,
        },
      },
    ]);
    expect(frame.comets).toBe(routeFrame.comets);
    expect(frame.resolutions).toBe(routeFrame.resolutions);
  });

  it("prefers a live bearing over the admitted route bearing", () => {
    const indexed = createIndexedMapTrack(createTrack());
    const routeFrame = mapPlaybackFrameAt([indexed], 8n, new Map());
    const live = {
      color: "#fff",
      label: "live gps",
      location: {
        bearingDeg: 271,
        latitude: 10,
        longitude: 20,
        timeNs: 8n,
      },
      stream: "/gps",
    };

    expect(withLiveMapMarkers(routeFrame, [live]).markers).toEqual([live]);
  });

  it("keeps live-only and no-fix-gap markers as headingless dots", () => {
    const indexed = createIndexedMapTrack({
      ...createTrack(),
      pointCount: 4,
      segments: [
        { points: [{ latitude: 0, longitude: 0, timeNs: 0n }] },
        { points: [{ latitude: 10, longitude: 10, timeNs: 10n }] },
      ],
    });
    const routeGap = mapPlaybackFrameAt([indexed], 5n, new Map());
    const gapLive = {
      color: "#fff",
      label: "gap gps",
      location: { latitude: 5, longitude: 5, timeNs: 5n },
      stream: "/gps",
    };
    const liveOnly = {
      ...gapLive,
      label: "other gps",
      stream: "/other-gps",
    };

    const frame = withLiveMapMarkers(routeGap, [gapLive, liveOnly]);

    expect(routeGap.markers).toEqual([]);
    expect(frame.markers).toEqual([gapLive, liveOnly]);
    expect(
      frame.markers.every((marker) => marker.location.bearingDeg == null),
    ).toBe(true);
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
    sourceName: "/gps/fix",
    status: "ready",
    stream: "/gps",
  };
}
