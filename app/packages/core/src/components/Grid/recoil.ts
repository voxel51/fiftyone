import { atom, selector } from "recoil";

import * as fos from "@fiftyone/state";

export const defaultGridZoom = selector<number>({
  key: "defaultGridZoom",
  get: ({ get }) => get(fos.config)?.gridZoom,
});

export const gridZoom = atom<number>({
  key: "gridZoom",
  default: defaultGridZoom,
});

export const gridZoomRange = atom<[number, number]>({
  key: "gridZoomRange",
  default: [0, 10],
});

export const rowAspectRatioThreshold = selector<number>({
  key: "rowAspectRatioThreshold",
  get: ({ get }) => 11 - Math.max(get(gridZoom), get(gridZoomRange)[0]),
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

export const pageParameters = selector({
  key: "paginateGridVariables",
  get: ({ getCallback }) => {
    return getCallback(
      ({ snapshot }) =>
        async (page: number, pageSize: number) => {
          const slice = await snapshot.getPromise(fos.groupSlice(false));

          return {
            dataset: await snapshot.getPromise(fos.datasetName),
            view: await snapshot.getPromise(fos.view),
            filters: await snapshot.getPromise(fos.filters),
            filter: {
              group: slice
                ? {
                    slice,
                    slices: [slice],
                  }
                : null,
            },
            extendedStages: await snapshot.getPromise(fos.extendedStages),
            after: page ? String(page * pageSize) : null,
            first: pageSize,
          };
        }
    );
  },
});
