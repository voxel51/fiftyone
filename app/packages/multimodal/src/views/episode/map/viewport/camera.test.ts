import { describe, expect, it } from "vitest";
import {
  EPISODE_MAP_MARKER_ZOOM,
  episodeMapPlaybackCameraTarget,
  episodeMapRouteCameraTarget,
} from "./camera";

const routeBounds = { east: 20, north: 10, south: 5, west: 15 };
const trailBounds = { east: 18, north: 8, south: 7, west: 17 };
const marker = { latitude: 7.5, longitude: 17.5 };

describe("episode map camera policy", () => {
  it("frames the recent trail ahead of the full recording", () => {
    expect(
      episodeMapPlaybackCameraTarget({
        bounds: routeBounds,
        marker,
        trailBounds,
      }),
    ).toEqual({ bounds: trailBounds, kind: "bounds", padding: 80 });
  });

  it("uses a street-scale current fix when there is no trail", () => {
    expect(
      episodeMapPlaybackCameraTarget({
        bounds: routeBounds,
        marker,
        trailBounds: null,
      }),
    ).toEqual({
      kind: "marker",
      latitude: marker.latitude,
      longitude: marker.longitude,
      zoom: EPISODE_MAP_MARKER_ZOOM,
    });
  });

  it("falls back to the route only without a current frame", () => {
    expect(
      episodeMapPlaybackCameraTarget({
        bounds: routeBounds,
        marker: null,
        trailBounds: null,
      }),
    ).toEqual(episodeMapRouteCameraTarget(routeBounds));
  });
});
