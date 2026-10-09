/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * @module accessors/grid/count
 */

import { useReverbValue } from "@fiftyone/reverb";
import { count } from "../../atoms/pathData/counts";

const GRID_COUNT = { extended: false, path: "", modal: false, lightning: true };

/** Samples in the grid's current view and filters; suspends while counting. */
export const useGridSampleCount = (): number => {
  const value = useReverbValue(count(GRID_COUNT));
  return typeof value === "number" ? value : 0;
};
