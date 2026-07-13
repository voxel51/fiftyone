import type { StyleSpecification } from "maplibre-gl";
import { describe, expect, it } from "vitest";
import {
  initialMcapMapBasemapStatus,
  mcapMapBasemapSourceIds,
  mcapMapBasemapStatusText,
  mergeMcapMapOverlaysIntoStyle,
} from "./mcap-map-basemap";
import { MCAP_MAP_BASE_LAYER } from "./mcap-map-tile-state";

const localStyle: StyleSpecification = {
  version: 8,
  sources: {
    "mcap-location-current": {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    },
  },
  layers: [
    {
      id: "mcap-location-background",
      type: "background",
    },
    {
      id: "mcap-location-puck",
      type: "circle",
      source: "mcap-location-current",
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

describe("MCAP map basemap lifecycle", () => {
  it("keeps MCAP overlays above a replacement basemap", () => {
    const merged = mergeMcapMapOverlaysIntoStyle(localStyle, remoteStyle);

    expect(Object.keys(merged.sources)).toEqual([
      "openmaptiles",
      "mcap-location-current",
    ]);
    expect(merged.layers.map(({ id }) => id)).toEqual([
      "remote-background",
      "mcap-location-puck",
    ]);
  });

  it("removes provider sources when returning to the local style", () => {
    const withBasemap = mergeMcapMapOverlaysIntoStyle(localStyle, remoteStyle);
    const localOnly = mergeMcapMapOverlaysIntoStyle(withBasemap, {
      version: 8,
      sources: {},
      layers: [{ id: "mcap-location-background", type: "background" }],
    });

    expect(Object.keys(localOnly.sources)).toEqual(["mcap-location-current"]);
    expect(localOnly.layers.map(({ id }) => id)).toEqual([
      "mcap-location-background",
      "mcap-location-puck",
    ]);
  });

  it("reports only provider sources as basemap dependencies", () => {
    const merged = mergeMcapMapOverlaysIntoStyle(localStyle, remoteStyle);

    expect(mcapMapBasemapSourceIds(merged)).toEqual(["openmaptiles"]);
  });

  it("names the provider while loading or unavailable", () => {
    expect(mcapMapBasemapStatusText("loading")).toBe(
      "Loading basemap from OpenFreeMap",
    );
    expect(mcapMapBasemapStatusText("error")).toBe(
      "Basemap unavailable from OpenFreeMap",
    );
    expect(mcapMapBasemapStatusText("ready")).toBeNull();
    expect(initialMcapMapBasemapStatus(MCAP_MAP_BASE_LAYER.NONE)).toBe(
      "disabled",
    );
    expect(initialMcapMapBasemapStatus(MCAP_MAP_BASE_LAYER.DEFAULT)).toBe(
      "loading",
    );
  });
});
