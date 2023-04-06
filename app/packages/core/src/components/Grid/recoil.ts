import { atom, selector, selectorFamily } from "recoil";

import * as fos from "@fiftyone/state";
import { groupSlice } from "@fiftyone/state";

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

export interface PageParameters {
  filters: fos.State.Filters;
  dataset: string;
  view: fos.State.Stage[];
  zoom: boolean;
}

export const pageParameters = selectorFamily<PageParameters, boolean>({
  key: "pageParameters",
  get:
    (modal) =>
    ({ get }) => {
      return {
        filters: get(modal ? fos.modalFilters : fos.filters),
        view: get(fos.view),
        dataset: get(fos.datasetName),
        extended: get(fos.extendedStages),
        zoom: get(fos.isPatchesView) && get(fos.cropToContent(modal)),
        slice: get(groupSlice(false)),
      };
    },
});
