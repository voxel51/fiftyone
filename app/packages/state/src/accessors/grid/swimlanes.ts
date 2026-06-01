/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Accessor hooks for the grid's optional swimlanes view (one row per group
 * / dynamic-group entry). Wraps the recoil selectors in `recoil/grid.ts`.
 *
 * @module accessors/grid/swimlanes
 */

import { useRecoilState, useRecoilValue } from "recoil";
import { gridSwimlanes, gridSwimlanesAvailable } from "../../recoil/grid";

/**
 * Returns the current swimlanes-enabled state and a setter. Persisted per
 * dataset; defaults to off on first visit.
 */
export const useGridSwimlanes = (): [boolean, (next: boolean) => void] =>
  useRecoilState(gridSwimlanes);

/** Whether swimlanes are offered — the active dataset must be grouped or dynamic-grouped. */
export const useGridSwimlanesAvailable = (): boolean =>
  useRecoilValue(gridSwimlanesAvailable);
