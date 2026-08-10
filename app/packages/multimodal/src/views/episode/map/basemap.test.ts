import type { StyleSpecification } from "maplibre-gl";
import { describe, expect, it } from "vitest";
import {
  initialMapBasemapStatus,
  mapBasemapSourceIds,
  mapBasemapStatusText,
  mergeMapOverlaysIntoStyle,
  shouldShowMapStaticPreview,
} from "./basemap";
import { MAP_BASE_LAYER } from "./rendering/types";

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
    const merged = mergeMapOverlaysIntoStyle(localStyle, remoteStyle);

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
    const withBasemap = mergeMapOverlaysIntoStyle(localStyle, remoteStyle);
    const localOnly = mergeMapOverlaysIntoStyle(withBasemap, {
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
    const merged = mergeMapOverlaysIntoStyle(localStyle, remoteStyle);

    expect(mapBasemapSourceIds(merged)).toEqual(["openmaptiles"]);
  });

  it("names the provider while loading or unavailable", () => {
    expect(mapBasemapStatusText("loading")).toBe(
      "Loading basemap from OpenFreeMap",
    );
    expect(mapBasemapStatusText("error")).toBe(
      "Basemap unavailable from OpenFreeMap",
    );
    expect(mapBasemapStatusText("ready")).toBeNull();
    expect(initialMapBasemapStatus(MAP_BASE_LAYER.NONE)).toBe("disabled");
    expect(initialMapBasemapStatus(MAP_BASE_LAYER.DEFAULT)).toBe("loading");
  });

  it("keeps the static route visible only until the interactive map is framed", () => {
    expect(
      shouldShowMapStaticPreview({
        cameraReady: true,
        failed: false,
        mapLoaded: false,
      }),
    ).toBe(true);
    expect(
      shouldShowMapStaticPreview({
        cameraReady: false,
        failed: false,
        mapLoaded: true,
      }),
    ).toBe(true);
    expect(
      shouldShowMapStaticPreview({
        cameraReady: true,
        failed: false,
        mapLoaded: true,
      }),
    ).toBe(false);
  });

  it("falls back to the static route when MapLibre fails", () => {
    expect(
      shouldShowMapStaticPreview({
        cameraReady: true,
        failed: true,
        mapLoaded: false,
      }),
    ).toBe(true);
    expect(
      shouldShowMapStaticPreview({
        cameraReady: true,
        failed: false,
        mapLoaded: true,
      }),
    ).toBe(false);
  });
});
