import {
  extendedSelection,
  getBrowserStorageEffectForKey,
  sampleFields,
  theme,
} from "@fiftyone/state";
import type {
  CircleLayerSpecification,
  SymbolLayerSpecification,
} from "maplibre-gl";
import { atom, selector } from "recoil";
import { SELECTION_SCOPE } from "./constants";

type CirclePaint = NonNullable<CircleLayerSpecification["paint"]>;
type SymbolPaint = NonNullable<SymbolLayerSpecification["paint"]>;

export interface Settings {
  clustering?: boolean;
  clusterMaxZoom?: number;
  clusters?: {
    textPaint: SymbolPaint;
    paint: CirclePaint;
  };
  pointPaint?: CirclePaint;
  mapboxAccessToken?: string;
}

export type MapSettings = Required<Omit<Settings, "mapboxAccessToken">> & {
  mapboxAccessToken?: string;
};

export const defaultSettings = Object.freeze({
  clustering: true,
  // https://maplibre.org/maplibre-style-spec/sources/#geojson-clustermaxzoom
  clusterMaxZoom: 11,
  clusters: {
    paint: {
      "circle-color": "rgb(244, 113, 6)",
      "circle-opacity": 0.7,
      // https://maplibre.org/maplibre-style-spec/expressions/#step
      "circle-radius": ["step", ["get", "point_count"], 20, 10, 30, 25, 40],
    },
    textPaint: {
      "text-color": "white",
    },
  },
  pointPaint: {
    "circle-color": "rgb(244, 113, 6)",
    "circle-opacity": 0.7,
    "circle-radius": 4,
  },
}) as MapSettings;

const defaultActiveField = selector<string>({
  key: "@fiftyone/map/state.defaultActiveField",
  get: ({ get }) => get(geoFields)[0],
});

export const activeField = atom<string>({
  key: "@fiftyone/map/state.activeField",
  default: defaultActiveField,
});

export const geoFields = selector<string[]>({
  key: "@fiftyone/map/state.geoFields",
  get: ({ get }) => {
    return get(sampleFields)
      .filter((f) => f.embeddedDocType === "fiftyone.core.labels.GeoLocation")
      .map(({ name }) => name)
      .sort();
  },
});

export const hasSelection = selector<boolean>({
  key: "hasSelection",
  get: ({ get }) => get(extendedSelection).scope === SELECTION_SCOPE,
});

const defaultMaplibreStyle = selector<string>({
  key: "defaultMaplibreStyle",
  get: ({ get }) => {
    return get(theme) === "dark" ? "Dark" : "Positron";
  },
});

export const maplibreStyle = atom<string>({
  key: "@fiftyone/map/state.maplibreStyle",
  default: defaultMaplibreStyle,
  effects: [
    getBrowserStorageEffectForKey("@fiftyone/map/state.maplibreStyle", {
      sessionStorage: true,
      map: (newValue: string) =>
        ["Dark", "Positron"].includes(newValue) ? undefined : newValue,
    }),
  ],
});

const defaultMapboxStyle = selector<string>({
  key: "defaultMapboxStyle",
  get: ({ get }) => {
    return get(theme) === "dark" ? "Dark" : "Light";
  },
});

export const mapboxStyle = atom<string>({
  key: "@fiftyone/map/state.mapboxStyle",
  default: defaultMapboxStyle,
  effects: [
    getBrowserStorageEffectForKey("@fiftyone/map/state.style", {
      sessionStorage: true,
      map: (newValue: string) =>
        ["Dark", "Light"].includes(newValue) ? undefined : newValue,
    }),
  ],
});
