import { DefaultValue, atom, atomFamily, selector } from "recoil";

import * as fos from "@fiftyone/state";

const lookerGridCachingStore = atomFamily<boolean, string>({
  key: "lookerGridCachingStore",
  default: true,
  effects: (id) => [
    fos.getBrowserStorageEffectForKey(`looker-grid-caching-${id}`, {
      valueClass: "boolean",
    }),
  ],
});

export const lookerGridCaching = selector({
  key: "lookerGridCaching",
  get: ({ get }) => {
    const id = get(fos.datasetId);
    if (!id) {
      throw new Error("no dataset");
    }
    return get(lookerGridCachingStore(id));
  },
  set: ({ get, set }, value) => {
    const id = get(fos.datasetId);
    if (!id) {
      throw new Error("no dataset");
    }
    set(
      lookerGridCachingStore(id),
      value instanceof DefaultValue ? false : value
    );
  },
});

export const defaultGridZoom = selector<number>({
  key: "defaultGridZoom",
  get: ({ get }) => get(fos.config)?.gridZoom,
});

export const gridPage = atom({
  key: "gridPage",
  default: 0,
});

export const gridAt = atom<string | null>({
  key: "gridAt",
  default: null,
});

export const gridOffset = atom({
  key: "gridOffset",
  default: 0,
  effects: [],
});

export const gridSpacing = atom({
  key: "gridSpacing",
  default: 3,
  effects: [
    fos.getBrowserStorageEffectForKey("gridSpacing", { valueClass: "number" }),
  ],
});

export const gridZoom = atom<number>({
  key: "gridZoom",
  default: defaultGridZoom,
  effects: [
    fos.getBrowserStorageEffectForKey("gridZoom", { valueClass: "number" }),
  ],
});

export const gridZoomRange = atom<[number, number]>({
  key: "gridZoomRange",
  default: [-5, 10],
});

export const gridCropCallback = selector({
  key: "gridCropCallback",
  get: ({ getCallback }) => {
    return getCallback(({ snapshot }) => async () => {
      return (
        (await snapshot.getPromise(fos.isPatchesView)) &&
        (await snapshot.getPromise(fos.cropToContent(false)))
      );
    });
  },
});

export const gridCrop = selector({
  key: "gridCrop",
  get: ({ get }) => {
    return get(fos.isPatchesView) && get(fos.cropToContent(false));
  },
});

export const pageParameters = selector({
  key: "paginateGridVariables",
  get: ({ get }) => {
    const slice = get(fos.groupSlice);
    const dataset = get(fos.datasetName);

    if (!dataset) {
      throw new Error("dataset is not defined");
    }
    const params = {
      dataset,
      view: get(fos.view),
      filters: get(fos.filters),
      filter: {
        group: slice
          ? {
              slice,
              slices: [slice],
            }
          : null,
      },
      extendedStages: get(fos.extendedStages),
    };
    return (page: number, pageSize: number) => {
      return {
        ...params,
        after: page ? String(page * pageSize - 1) : null,
        first: pageSize,
      };
    };
  },
});

export const showGridPixels = atom({ key: "showGridPixels", default: false });
