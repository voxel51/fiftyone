import type { StyleSpecification } from "maplibre-gl";
import { describe, expect, it } from "vitest";
import {
  initialEpisodeMapBasemapStatus,
  episodeMapBasemapSourceIds,
  episodeMapBasemapStatusText,
  mergeEpisodeMapOverlaysIntoStyle,
  shouldShowEpisodeMapStaticPreview,
} from "./episode-map-basemap";
import { EPISODE_MAP_BASE_LAYER } from "./episode-map-tile-state";

const localStyle: StyleSpecification = {
  version: 8,
  sources: {
    "episode-location-current": {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    },
  },
  layers: [
    {
      id: "episode-location-background",
      type: "background",
    },
    {
      id: "episode-location-puck",
      type: "circle",
      source: "episode-location-current",
    },
  ],
};

const remoteStyle: StyleSpecification = {
  version: 8,
  sources: {
    openmaptiles: {
      type: "vector",
      url: "https://tiles.openfreemap.org/planet",
    },
  },
  layers: [{ id: "remote-background", type: "background" }],
};

describe("episode map basemap lifecycle", () => {
  it("keeps episode overlays above a replacement basemap", () => {
    const merged = mergeEpisodeMapOverlaysIntoStyle(localStyle, remoteStyle);

    expect(Object.keys(merged.sources)).toEqual([
      "openmaptiles",
      "episode-location-current",
    ]);
    expect(merged.layers.map(({ id }) => id)).toEqual([
      "remote-background",
      "episode-location-puck",
    ]);
  });

  it("removes provider sources when returning to the local style", () => {
    const withBasemap = mergeEpisodeMapOverlaysIntoStyle(
      localStyle,
      remoteStyle,
    );
    const localOnly = mergeEpisodeMapOverlaysIntoStyle(withBasemap, {
      version: 8,
      sources: {},
      layers: [{ id: "episode-location-background", type: "background" }],
    });

    expect(Object.keys(localOnly.sources)).toEqual([
      "episode-location-current",
    ]);
    expect(localOnly.layers.map(({ id }) => id)).toEqual([
      "episode-location-background",
      "episode-location-puck",
    ]);
  });

  it("reports only provider sources as basemap dependencies", () => {
    const merged = mergeEpisodeMapOverlaysIntoStyle(localStyle, remoteStyle);

    expect(episodeMapBasemapSourceIds(merged)).toEqual(["openmaptiles"]);
  });

  it("names the provider while loading or unavailable", () => {
    expect(episodeMapBasemapStatusText("loading")).toBe(
      "Loading basemap from OpenFreeMap",
    );
    expect(episodeMapBasemapStatusText("error")).toBe(
      "Basemap unavailable from OpenFreeMap",
    );
    expect(episodeMapBasemapStatusText("ready")).toBeNull();
    expect(initialEpisodeMapBasemapStatus(EPISODE_MAP_BASE_LAYER.NONE)).toBe(
      "disabled",
    );
    expect(initialEpisodeMapBasemapStatus(EPISODE_MAP_BASE_LAYER.DEFAULT)).toBe(
      "loading",
    );
  });

  it("keeps the static route visible until the provider map can take over", () => {
    expect(
      shouldShowEpisodeMapStaticPreview({
        basemapStatus: "loading",
        cameraReady: true,
        failed: false,
        mapLoaded: true,
      }),
    ).toBe(true);
    expect(
      shouldShowEpisodeMapStaticPreview({
        basemapStatus: "ready",
        cameraReady: false,
        failed: false,
        mapLoaded: true,
      }),
    ).toBe(true);
    expect(
      shouldShowEpisodeMapStaticPreview({
        basemapStatus: "ready",
        cameraReady: true,
        failed: false,
        mapLoaded: true,
      }),
    ).toBe(false);
  });

  it("falls back to the static route when MapLibre fails", () => {
    expect(
      shouldShowEpisodeMapStaticPreview({
        basemapStatus: "error",
        cameraReady: true,
        failed: true,
        mapLoaded: false,
      }),
    ).toBe(true);
    expect(
      shouldShowEpisodeMapStaticPreview({
        basemapStatus: "error",
        cameraReady: true,
        failed: false,
        mapLoaded: true,
      }),
    ).toBe(false);
  });
});
