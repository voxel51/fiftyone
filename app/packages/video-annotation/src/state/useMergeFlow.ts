/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  atom,
  type PrimitiveAtom,
  useAtom,
  useAtomValue,
  useSetAtom,
} from "jotai";
import { useCallback, useMemo } from "react";

/**
 * Two-click "Merge" interaction state. The user first selects a track via
 * normal single-click, then clicks the Merge toolbar button to enter a
 * "pending merge target" mode. The next track-row click consumes the pending
 * state and merges that (source) track into the originally-selected (target)
 * track. Escape, click-outside-any-track, or clicking the Merge button again
 * all cancel without merging.
 *
 * State is a module-level jotai atom so the toolbar button (writer) and the
 * track click decorator (reader / consumer) — mounted in distinct subtrees of
 * the surface — share the same store. `null` means "not in pending merge
 * mode"; a string value is the target track id captured at the moment the
 * Merge button was pressed.
 */
const mergeTargetAtom = atom<string | null>(null) as PrimitiveAtom<
  string | null
>;

/** Read-only: the pending merge target id (or null). */
export const useMergeTarget = (): string | null =>
  useAtomValue(mergeTargetAtom);

/** Read-only: whether the surface is currently waiting for a merge source. */
export const useIsMergePending = (): boolean => useMergeTarget() !== null;

export interface MergeFlow {
  /** Track id captured as the merge target when the user clicked Merge. */
  target: string | null;
  /** True iff the surface is awaiting a source-track click. */
  pending: boolean;
  /** Enter "pending" mode with `targetId` as the surviving track. */
  beginMerge: (targetId: string) => void;
  /** Exit "pending" mode without merging. */
  cancelMerge: () => void;
  /**
   * If `pending` and `sourceId` differs from the target, returns
   * `{ source, target }` and clears the pending state — the caller dispatches
   * the actual `mergeTracks` action. Returns `null` for a self-merge or when
   * not pending (so the caller can fall through to normal selection).
   */
  consumeMerge: (sourceId: string) => { source: string; target: string } | null;
}

/**
 * The full merge-flow seam. Toolbar wires {@link beginMerge} / {@link cancelMerge}
 * to the Merge button; the track-row click handler asks {@link consumeMerge}
 * first and only falls back to `selectTrack` when it returns `null`.
 */
export const useMergeFlow = (): MergeFlow => {
  const [target, setTarget] = useAtom(mergeTargetAtom);

  const beginMerge = useCallback(
    (targetId: string) => setTarget(targetId),
    [setTarget],
  );

  const cancelMerge = useCallback(() => setTarget(null), [setTarget]);

  const consumeMerge = useCallback(
    (sourceId: string) => {
      if (target === null) {
        return null;
      }

      // Always clear the pending state on a track click — even a self-click
      // exits the mode so the user isn't stuck.
      setTarget(null);

      if (sourceId === target) {
        return null;
      }

      return { source: sourceId, target };
    },
    [target, setTarget],
  );

  return useMemo(
    () => ({
      target,
      pending: target !== null,
      beginMerge,
      cancelMerge,
      consumeMerge,
    }),
    [target, beginMerge, cancelMerge, consumeMerge],
  );
};

/** Setter-only variant for keybinding / document-click handlers. */
export const useCancelMerge = (): (() => void) => {
  const setTarget = useSetAtom(mergeTargetAtom);
  return useCallback(() => setTarget(null), [setTarget]);
};
