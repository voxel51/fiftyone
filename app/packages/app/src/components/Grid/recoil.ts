import { toSnakeCase } from "@fiftyone/utilities";
import { atom, selector, selectorFamily } from "recoil";
import { appConfig, cropToContent } from "../../recoil/atoms";

import * as filterAtoms from "../../recoil/filters";
import * as selectors from "../../recoil/selectors";
import { State } from "../../recoil/types";
import * as viewAtoms from "../../recoil/view";

import { similarityParameters } from "../Actions/Similar";

export const defaultGridZoom = selector<number>({
  key: "defaultGridZoom",
  get: ({ get }) => get(appConfig)?.gridZoom,
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
  filters: State.Filters;
  dataset: string;
  view: State.Stage[];
  zoom: boolean;
}

export const pageParameters = selectorFamily<PageParameters, boolean>({
  key: "pageParameters",
  get:
    (modal) =>
    ({ get }) => {
      const similarity = get(similarityParameters);
      return {
        filters: get(modal ? filterAtoms.filters : filterAtoms.modalFilters),
        view: get(viewAtoms.view),
        dataset: get(selectors.datasetName),
        similarity: similarity && !modal ? toSnakeCase(similarity) : null,
        zoom: get(viewAtoms.isPatchesView) && get(cropToContent(modal)),
      };
    },
});
