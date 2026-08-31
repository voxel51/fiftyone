/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { atom, type PrimitiveAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect } from "react";

/**
 * The active timeline's `pause`, published for callers that sit OUTSIDE the
 * `PlaybackProvider` and so cannot reach `usePlayback()`.
 *
 * The modal's action bar is the motivating case: `<Actions />` is a sibling of
 * the media container, not a descendant, so the surface's provider is not an
 * ancestor of it. It still needs to stop playback — a menu offering "select
 * visible labels in this frame" is meaningless if the frame keeps changing
 * underneath the choice.
 *
 * Null whenever no timeline is mounted, which is the normal state for image
 * samples; every consumer therefore has to treat pausing as best-effort.
 */
// Cast preserves the writable shape: jotai's overloads narrow a bare `null`
// initial value to a read-only `Atom`, matching the read-fn overload first.
// Same quirk as `tiling`'s `tileSelectionAtom` and `use-tile-state`.
const playbackPauseHandleAtom = atom<(() => void) | null>(
  null,
) as PrimitiveAtom<(() => void) | null>;

/**
 * Publish this provider's `pause`. Called by `PlaybackProvider` itself.
 *
 * Only one timeline is mounted in the modal at a time (Explore and Annotate
 * swap, they do not coexist), so last-mount-wins is sufficient. The unmount
 * clears the handle only when it is still the one we published, so a
 * provider swap cannot blank out its replacement's.
 */
export const usePublishPauseHandle = (pause: () => void): void => {
  const setHandle = useSetAtom(playbackPauseHandleAtom);

  useEffect(() => {
    // Wrapped in an updater: jotai treats a bare function value as a
    // reducer, so `setHandle(pause)` would store `pause(prev)`'s result.
    setHandle(() => pause);

    return () => {
      setHandle((current) => (current === pause ? null : current));
    };
  }, [pause, setHandle]);
};

/**
 * Request that the active timeline pause, from anywhere in the app.
 *
 * A no-op when nothing is mounted, so callers need no media-type check. The
 * returned callback is stable for as long as the handle is.
 */
export const useRequestPlaybackPause = (): (() => void) => {
  const pause = useAtomValue(playbackPauseHandleAtom);

  return useCallback(() => pause?.(), [pause]);
};
