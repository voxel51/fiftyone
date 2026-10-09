/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * @module accessors/grid/count
 */

import { useReverbValue } from "@fiftyone/reverb";
import { count, GRID_COUNT } from "../../atoms/pathData/counts";

/** Samples in the grid's current view and filters; suspends while counting. */
export const useGridSampleCount = (): number => {
  const value = useReverbValue(count(GRID_COUNT));
  return typeof value === "number" ? value : 0;
};
