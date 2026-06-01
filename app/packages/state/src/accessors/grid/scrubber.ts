/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Accessor hooks for the grid's optional right-edge scrubber. Wraps the
 * recoil selectors in `recoil/grid.ts` so consumers (the Grid header, the
 * Grid render slot) interact only with hooks and never call
 * `useRecoilValue` directly on the underlying atoms.
 *
 * @module accessors/grid/scrubber
 */

import { useRecoilState, useRecoilValue, useRecoilValueLoadable } from "recoil";
import {
  gridScrubber,
  gridScrubberAvailable,
  gridSortFieldBounds,
} from "../../recoil/grid";

/**
 * Returns the current scrubber-enabled state and a setter. Persisted per
 * dataset; defaults to off on first visit.
 */
export const useGridScrubber = (): [boolean, (next: boolean) => void] =>
  useRecoilState(gridScrubber);

/**
 * Whether the scrubber gate is satisfied for the current dataset state:
 * query performance is active, a sort field is selected, and that field is
 * numeric. Toggle UI hides the control when this returns `false`.
 */
export const useGridScrubberAvailable = (): boolean =>
  useRecoilValue(gridScrubberAvailable);

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
