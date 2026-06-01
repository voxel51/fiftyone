/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Accessor hooks for the grid's right-edge scrubber. Wraps the recoil
 * selectors in `recoil/grid.ts` so consumers (the Grid header, the Grid
 * render slot) interact only with hooks and never call `useRecoilValue`
 * directly on the underlying atoms.
 *
 * @module accessors/grid/scrubber
 */

import { useRecoilState, useRecoilValueLoadable } from "recoil";
import { gridScrubber, gridSortFieldBounds } from "../../recoil/grid";

/**
 * Returns the current scrubber-enabled state and a setter. Persisted per
 * dataset; defaults to on.
 */
export const useGridScrubber = (): [boolean, (next: boolean) => void] =>
  useRecoilState(gridScrubber);

/**
 * `[min, max]` bounds for the current sort field, or `null` when no field
 * is selected, the field isn't numeric, or the bounds aggregation hasn't
 * yet resolved. Uses a loadable so the hook never suspends; consumers fall
 * back to normal scrolling while bounds load.
 */
export const useGridSortFieldBounds = (): [number, number] | null => {
  const loadable = useRecoilValueLoadable(gridSortFieldBounds);
  return loadable.state === "hasValue" ? loadable.contents : null;
};
