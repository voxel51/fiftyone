import { describe, expect, it, vi } from "vitest";

import type { LocationTrackState } from "../tracks/location-track";
import {
  activeRouteGradient,
  cometSourceId,
  createIndexedMapTrack,
  MAP_ROUTE_PAINT,
  reconcileTrackLayers,
  routeLayerId,
} from "./route-layers";

describe("map route layers", () => {
  it("reuses the spatial index and clamps route gradient progress", () => {
    const track = createTrack();
    const first = createIndexedMapTrack(track);
    const second = createIndexedMapTrack(track);

    expect(second.index).toBe(first.index);
    expect(first.key).toBe("#ff6600:/gps");
    expect(activeRouteGradient("#000", 1, "#fff", 0.5, 2)[3]).toBe(1);
  });

  it("adds and removes the complete layer family as membership changes", () => {
    const addSource = vi.fn();
    const addLayer = vi.fn();
    const removeLayer = vi.fn();
    const removeSource = vi.fn();
    const map = {
      addLayer,
      addSource,
      getLayer: vi.fn(() => ({})),
      getSource: vi.fn(() => ({})),
      removeLayer,
      removeSource,
    } as never;
    const installed = new Map<string, LocationTrackState>();
    const indexed = createIndexedMapTrack(createTrack());

    reconcileTrackLayers(map, [indexed], installed);
    expect(addSource).toHaveBeenCalledTimes(2);
    expect(addLayer).toHaveBeenCalledTimes(7);
    expect(installed.has(indexed.key)).toBe(true);
    const layers = addLayer.mock.calls.map(([layer]) => layer);
    expect(
      layers.find(({ id }) => id === routeLayerId(indexed.key, "past"))?.paint,
    ).toMatchObject({
      "line-opacity": MAP_ROUTE_PAINT.pastOpacity,
      "line-width": MAP_ROUTE_PAINT.routeWidth,
    });
    expect(
      layers.find(({ id }) => id === cometSourceId(indexed.key))?.paint,
    ).toMatchObject({ "line-width": MAP_ROUTE_PAINT.cometWidth });

    reconcileTrackLayers(map, [], installed);
    expect(removeLayer).toHaveBeenCalledTimes(7);
    expect(removeSource).toHaveBeenCalledTimes(2);
    expect(installed.size).toBe(0);
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
          { latitude: 37, longitude: -122, timeNs: 0n },
          { latitude: 38, longitude: -121, timeNs: 10n },
        ],
      },
    ],
    sourceName: "/gps/fix",
    status: "ready",
    stream: "/gps",
  };
}
