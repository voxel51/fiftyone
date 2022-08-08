import { dataset, extendedSelection } from "@fiftyone/state";
import { atom, selector } from "recoil";

export interface Settings {}

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
  get: ({ get }) => get(extendedSelection)?.length > 0,
  set: ({ reset }, newValue) => {
    if (newValue === true) {
      throw new Error("not allowed");
    }
    reset(extendedSelection);
  },
});

export const MAP_STYLES = {
  Street: "streets-v11",
  Dark: "dark-v10",
  Light: "light-v10",
  Outdoors: "outdoors-v11",
  Satellite: "satellite-v9",
};
export const STYLES = Object.keys(MAP_STYLES);

export const mapStyle = atom<string>({
  key: "@fiftyone/map/state.mapStyle",
  default: "Dark",
});
