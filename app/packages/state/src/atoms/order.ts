/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The order the grid pages: its view, filters and sort, as the server's
 * `OrderInput`. Not exported; read through the grid and modal accessors.
 */

import type { openOrderQuery$variables } from "@fiftyone/relay";
import { atom, selector } from "@fiftyone/reverb";
import { filters } from "./filters";
import { gridSortBy } from "./grid";
import { groupSlice } from "./groups";
import { datasetName, extendedStagesNoSort } from "./selectors";
import { view } from "./view";

export type OrderInput = openOrderQuery$variables["input"];

export const gridOrderInput = selector<OrderInput>({
  key: "gridOrderInput",
  get: ({ get }) => {
    const dataset = get(datasetName);
    if (!dataset) throw new Error("dataset is not defined");

    const sort = get(gridSortBy);

    return {
      dataset,
      view: get(view),
      filters: get(filters),
      extendedStages: get(extendedStagesNoSort),
      groupSlice: get(groupSlice) ?? null,
      sortBy: sort?.field ?? null,
      desc: Boolean(sort?.descending),
    };
  },
});

/** The grid order the open sample was opened from, for its position. */
export const modalOrderInput = atom<OrderInput | null>({
  key: "modalOrderInput",
  default: null,
});
