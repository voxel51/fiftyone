import { DefaultValue, atom, selector } from "recoil";

import { subscribe } from "@fiftyone/relay";
import * as fos from "@fiftyone/state";

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

export const gridZoom = selector<number>({
  key: "gridZoom",
  get: ({ get }) =>
    get(interevenedGridZoom) ??
    get(recommendedGridZoom) ??
    get(storedGridZoom) ??
    get(defaultGridZoom),
  set: ({ get, set }, value) => {
    let result = value;
    if (value instanceof DefaultValue) {
      result = get(defaultGridZoom);
    }

    if (get(recommendedGridZoom)) {
      set(interevenedGridZoom, result);
    }

    set(storedGridZoom, result);
  },
});

export const gridZoomRange = atom<[number, number]>({
  key: "gridZoomRange",
  default: [-5, 10],
  effects: [() => subscribe((_, { reset }) => reset(gridZoomRange))],
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

export const interevenedGridZoom = atom<number | null>({
  key: "intervenedGridZoom",
  default: null,
  effects: [
    subscribe(
      ({ event }, { reset }, prev) =>
        event !== "modal" &&
        prev?.event !== "modal" &&
        reset(interevenedGridZoom)
    ),
  ],
});

export const maxGridItemsSizeBytes = atom({
  key: "maxGridItemsSizeBytes",
  // @ts-ignore
  default: ((navigator.deviceMemory ?? 8) / 8) * 1e9,
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

export const recommendedGridZoom = atom<number | null>({
  key: "recommendedGridZoom",
  default: null,
  effects: [
    subscribe(
      ({ event }, { reset }, prev) =>
        event !== "modal" &&
        prev?.event !== "modal" &&
        reset(interevenedGridZoom)
    ),
  ],
});

export const showGridPixels = atom({ key: "showGridPixels", default: false });

export const storedGridZoom = atom<number | null>({
  key: "storedGridZoom",
  default: null,
  effects: [
    fos.getBrowserStorageEffectForKey("gridZoom", { valueClass: "number" }),
  ],
});
