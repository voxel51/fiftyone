/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Accessor hook for the grid's swimlanes view. Wraps the recoil selector
 * in `recoil/grid.ts`.
 *
 * @module accessors/grid/swimlanes
 */

import { useRecoilState, useRecoilValue } from "recoil";
import { gridSwimlanes, gridSwimlanesAvailable } from "../../recoil/grid";

/**
 * Returns the current swimlanes-enabled state and a setter. Persisted per
 * dataset; defaults to on.
 */
export const useGridSwimlanes = (): [boolean, (next: boolean) => void] =>
  useRecoilState(gridSwimlanes);

/**
 * Whether the swimlanes feature should be offered. Drives toggle
 * visibility in the header — only available on "group" media-type
 * datasets.
 */
export const useGridSwimlanesAvailable = (): boolean =>
  useRecoilValue(gridSwimlanesAvailable);
