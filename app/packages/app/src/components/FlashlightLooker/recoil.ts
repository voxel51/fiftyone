import { toSnakeCase } from "@fiftyone/utilities";
import { selectorFamily } from "recoil";

import * as filterAtoms from "../../recoil/filters";
import * as selectors from "../../recoil/selectors";
import { State } from "../../recoil/types";
import * as viewAtoms from "../../recoil/view";

import { similarityParameters } from "../Actions/Similar";

export interface PageParameters {
  filters: State.Filters;
  dataset: string;
  view: State.Stage[];
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
      };
    },
});
