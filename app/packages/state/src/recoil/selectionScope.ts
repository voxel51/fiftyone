import { subscribe } from "@fiftyone/relay";
import { useCallback } from "react";
import { atom, selector, useSetRecoilState } from "recoil";
import {
  selectionDomainDataset,
  selectionDomainId,
  viewConversion,
} from "../selection/model";
import type { SelectionBoundary } from "../selection/types";
import { datasetId } from "./selectors";
import { view } from "./view";

const selectionScope = atom<{
  domainId: string;
  boundary: SelectionBoundary;
  /** Bumped whenever a subset's membership may have changed. */
  revision: number;
} | null>({
  key: "selectionScope",
  default: null,
});

/**
 * Whether a scope switch's new view has yet to arrive. Its boundary applies
 * at once, but the view comes with the next page; counts hold until then
 * rather than pair the new scope with the outgoing view.
 */
const scopeSwitchPending = atom<boolean>({
  key: "selectionScopeSwitchPending",
  default: false,
});

/**
 * Each domain's boundary as the tray sets it, mirrored in the same update
 * rather than after the grid renders.
 */
const selectionBoundaries = atom<Readonly<Record<string, SelectionBoundary>>>({
  key: "selectionBoundaries",
  default: {},
});

/**
 * The scope counts apply. The grid publishes after it renders, and a switch
 * to another kind of view (samples, patches, frames) suspends it meanwhile,
 * so its scope may still name the old view. Until it catches up, the
 * boundary the new view's domain holds stands in: counting with none would
 * show every result for a moment, and the old one belongs to another view.
 */
const currentSelectionScope = selector({
  key: "currentSelectionScope",
  get: ({ get }) => {
    // Never settles; ending the hold evaluates the scope again
    if (get(scopeSwitchPending)) return new Promise<never>(() => undefined);
    const scope = get(selectionScope);
    if (!scope) return null;

    const dataset = get(datasetId) ?? "";
    const domainId = selectionDomainId(
      dataset,
      viewConversion(get(view))?.key ?? null,
    );
    if (scope.domainId === domainId) return scope;
    const boundary = get(selectionBoundaries)[domainId];
    if (!boundary) return null;
    return {
      domainId,
      boundary,
      // Revisions count one dataset's membership edits
      revision:
        selectionDomainDataset(scope.domainId) === dataset ? scope.revision : 0,
    };
  },
});

/** The browsing boundary counts are scoped to. */
export const selectionScopeBoundary = selector<SelectionBoundary | null>({
  key: "selectionScopeBoundary",
  get: ({ get }) => get(currentSelectionScope)?.boundary ?? null,
});

/**
 * The scope's membership revision. Counts key on it, so a scope whose
 * subset gained or lost members is counted again rather than read from cache.
 */
export const selectionScopeRevision = selector<number>({
  key: "selectionScopeRevision",
  get: ({ get }) => get(currentSelectionScope)?.revision ?? 0,
});

/** Publishes a browsing boundary together with the dataset and view it belongs to. */
export function useSetSelectionScopeBoundary() {
  return useSetRecoilState(selectionScope);
}

/** Mirrors every domain's boundary as the tray sets it. */
export function useSetSelectionBoundaries() {
  return useSetRecoilState(selectionBoundaries);
}

/**
 * Holds scoped counts until the next full page lands: for a scope switch
 * whose view arrives with that page, after its boundary has already applied.
 */
export function useHoldScopedCountsUntilNextPage() {
  const setPending = useSetRecoilState(scopeSwitchPending);
  return useCallback(() => {
    setPending(true);
    const unsubscribe = subscribe((page, { set }) => {
      // Modal, slice, and other partial pages leave the view as it was
      if (page.event) return;
      unsubscribe();
      set(scopeSwitchPending, false);
    });
  }, [setPending]);
}
