/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Accessor hook for the grid's swimlanes view. Wraps the recoil selector
 * in `recoil/grid.ts`.
 *
 * @module accessors/grid/swimlanes
 */

import { useRecoilState } from "recoil";
import { gridSwimlanes } from "../../recoil/grid";

/**
 * Returns the current swimlanes-enabled state and a setter. Persisted per
 * dataset; defaults to on.
 */
export const useGridSwimlanes = (): [boolean, (next: boolean) => void] =>
  useRecoilState(gridSwimlanes);
