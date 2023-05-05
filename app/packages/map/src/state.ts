import {
  dataset,
  extendedSelection,
  getBrowserStorageEffectForKey,
  theme,
} from "@fiftyone/state";
import { atom, selector } from "recoil";
import { SELECTION_SCOPE } from "./constants";

export interface Settings {
  clustering?: boolean;
  clusterMaxZoom?: number;
  clusters?: {
    textPaint: mapboxgl.SymbolPaint;
    paint: mapboxgl.CirclePaint;
  };
  pointPaint?: mapboxgl.CirclePaint;
  mapboxAccessToken: string;
}

export const defaultSettings = Object.freeze({
  clustering: true,
  // https://docs.mapbox.com/help/glossary/zoom-level/
  clusterMaxZoom: 11,
  clusters: {
    paint: {
      "circle-color": "rgb(244, 113, 6)",
      "circle-opacity": 0.7,
      // Use step expressions (https://docs.mapbox.com/mapbox-gl-js/style-spec/#expressions-step)
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
}) as Required<Omit<Settings, "mapboxAccessToken">>;

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
    return get(dataset)
      .sampleFields.filter(
        (f) => f.embeddedDocType === "fiftyone.core.labels.GeoLocation"
      )
      .map(({ name }) => name)
      .sort();
  },
});

export const hasSelection = selector<boolean>({
  key: "hasSelection",
  get: ({ get }) => get(extendedSelection).scope === SELECTION_SCOPE,
});

export const MAP_STYLES = {
  Street: "streets-v11",
  Dark: "dark-v10",
  Light: "light-v10",
  Outdoors: "outdoors-v11",
  Satellite: "satellite-v9",
};
export const STYLES = Object.keys(MAP_STYLES);

const defaultMapStyle = selector<string>({
  key: "defaultMapStyle",
  get: ({ get }) => {
    return get(theme) === "dark" ? "Dark" : "Light";
  },
});

export const mapStyle = atom<string>({
  key: "@fiftyone/map/state.mapStyle",
  default: defaultMapStyle,
  effects: [
    getBrowserStorageEffectForKey("@fiftyone/map/state.style", {
      sessionStorage: true,
      map: (newValue: string) =>
        ["Dark", "Light"].includes(newValue) ? undefined : newValue,
    }),
  ],
});
