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

import {
  useRecoilCallback,
  useRecoilState,
  useRecoilValue,
  useRecoilValueLoadable,
} from "recoil";
import {
  gridScrubCursor,
  gridScrubber,
  gridScrubberAvailable,
  gridScrubbing,
  gridSortFieldBounds,
} from "../../recoil/grid";
import { datasetId } from "../../recoil/selectors";

/**
 * Returns the current scrubber-enabled state and a setter. Persisted per
 * dataset; defaults to on.
 */
export const useGridScrubber = (): [boolean, (next: boolean) => void] =>
  useRecoilState(gridScrubber);

/**
 * Whether the scrubber feature should be offered at all in the current
 * grid context. Drives toggle visibility in the header — only available
 * when the grid is sorting (which itself requires query performance).
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

/**
 * Commits a scrub cursor value (typically the scrubber's `onChange`).
 * Writes to {@link gridScrubCursor} keyed by the active dataset. The grid
 * picks up the new cursor on its next mount (via `pageParameters` and a
 * `reset` bump).
 */
export const useCommitGridScrubCursor = () =>
  useRecoilCallback(
    ({ snapshot, set }) =>
      async (cursor: string | null) => {
        const id = (await snapshot.getPromise(datasetId)) ?? "";
        set(gridScrubCursor(id), cursor);
      },
    []
  );

/**
 * `[isScrubbing, setIsScrubbing]` — `true` while the user is dragging the
 * scrubber thumb. The grid's `useEvents` watches this to show the
 * falling-pixels overlay for the duration of the drag.
 */
export const useGridScrubbing = (): [boolean, (next: boolean) => void] =>
  useRecoilState(gridScrubbing);
