import { describe, expect, it } from "vitest";
import {
  getMapProvider,
  getMapStyles,
  getMapStyleUrl,
  MAPBOX_STYLES,
  MAPLIBRE_STYLES,
  OPENFREEMAP_ATTRIBUTION,
} from "./basemaps";

describe("map provider", () => {
  it("uses MapLibre unless a Mapbox token is configured", () => {
    expect(getMapProvider()).toBe("maplibre");
    expect(getMapProvider("")).toBe("maplibre");
    expect(getMapProvider("pk.example")).toBe("mapbox");
  });
});

describe("basemaps", () => {
  it("provides OpenFreeMap styles for MapLibre", () => {
    expect(getMapStyles("maplibre")).toEqual(Object.keys(MAPLIBRE_STYLES));
    for (const [name, id] of Object.entries(MAPLIBRE_STYLES)) {
      expect(getMapStyleUrl("maplibre", name)).toBe(
        `https://tiles.openfreemap.org/styles/${id}`,
      );
    }

    expect(OPENFREEMAP_ATTRIBUTION).toContain("openfreemap.org");
    expect(OPENFREEMAP_ATTRIBUTION).toContain("openmaptiles.org");
    expect(OPENFREEMAP_ATTRIBUTION).toContain("openstreetmap.org/copyright");
  });

  it("provides Mapbox styles when a token is configured", () => {
    expect(getMapStyles("mapbox")).toEqual(Object.keys(MAPBOX_STYLES));
    for (const [name, id] of Object.entries(MAPBOX_STYLES)) {
      expect(getMapStyleUrl("mapbox", name)).toBe(
        `mapbox://styles/mapbox/${id}`,
      );
    }
  });

  it("falls back when a stored style belongs to the other provider", () => {
    expect(getMapStyleUrl("maplibre", "Satellite")).toBe(
      "https://tiles.openfreemap.org/styles/positron",
    );
    expect(getMapStyleUrl("mapbox", "Positron")).toBe(
      "mapbox://styles/mapbox/light-v10",
    );
  });
});
