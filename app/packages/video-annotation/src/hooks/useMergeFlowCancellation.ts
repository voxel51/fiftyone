/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useEffect } from "react";
import { useCancelMerge, useIsMergePending } from "../state/useMergeFlow";

/**
 * Global cancellation paths for the two-click merge flow. Mount once inside
 * the video annotation surface — the hook is inert (no listeners) unless the
 * merge state is currently pending, so it only attaches `keydown` + `mousedown`
 * listeners while the user is in pending mode.
 *
 * Cancels on:
 *  - **Escape** keydown — captured on the document so the press doesn't have
 *    to be on a focused element to take effect.
 *  - **mousedown outside any track row** — track rows render
 *    `data-track-id={instanceId}`; a click whose target is not inside such a
 *    row (timeline ruler, canvas, toolbar background, etc.) cancels. Track
 *    clicks themselves are handled by the row's onClick, which calls
 *    `consumeMerge` and supersedes the document-level cancellation by
 *    consuming the pending state first.
 *
 * Note: the document `mousedown` listener fires BEFORE the React row `onClick`,
 * but `consumeMerge` on the row reads the atom synchronously and is keyed on
 * the target id, so even if we naively cancelled here on every mousedown the
 * row click's `consumeMerge` would see `null` and fail to merge. We therefore
 * check whether the event target sits inside a `[data-track-id]` element and
 * defer to the row in that case.
 */
export const useMergeFlowCancellation = (): void => {
  const pending = useIsMergePending();
  const cancel = useCancelMerge();

  useEffect(() => {
    if (!pending) {
      return undefined;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        cancel();
      }
    };

    const onMouseDown = (event: MouseEvent) => {
      const target = event.target;

      if (target instanceof Element && target.closest("[data-track-id]")) {
        // Track row — its onClick will consume / clear the pending state.
        return;
      }

      cancel();
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onMouseDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [pending, cancel]);
};
