/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  atom,
  getDefaultStore,
  type PrimitiveAtom,
  useAtomValue,
  useSetAtom,
} from "jotai";
import { useCallback, useEffect, useRef } from "react";

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
 * Both sides target the process-wide default store EXPLICITLY rather than
 * resolving through Jotai context.
 *
 * Publisher and consumer sit in different subtrees by construction — that is
 * the whole reason this handle exists — so "nearest provider wins" would let
 * any `<JotaiProvider>` mounted between them route the write and the read to
 * different stores, and the pause would silently do nothing. `PlaybackProvider`
 * documents this exact hazard as the reason it mounts no provider of its own.
 *
 * `@fiftyone/state`'s `jotaiStore` is this same `getDefaultStore()`, so app
 * code sharing this atom lands in the same place without this package taking
 * a dependency on `@fiftyone/state`.
 */
const store = getDefaultStore();

/**
 * Publish this provider's `pause`. Called by `PlaybackProvider` itself.
 *
 * Only one timeline is mounted in the modal at a time (Explore and Annotate
 * swap, they do not coexist), so last-mount-wins is sufficient. The unmount
 * clears the handle only when it is still the one we published, so a
 * provider swap cannot blank out its replacement's.
 */
export const usePublishPauseHandle = (pause: () => void): void => {
  const setHandle = useSetAtom(playbackPauseHandleAtom, { store });

  // `pause` is documented as stable, but it rides on the engine's `actions`
  // memo, which depends on nine values including several callbacks that do
  // change across stream and retry cycles. Publishing `pause` directly would
  // therefore re-run the effect — writing the atom — on many renders in
  // exactly the hot path. Publish a stable wrapper once per mount instead and
  // read the current `pause` through a ref.
  const pauseRef = useRef(pause);
  useEffect(() => {
    pauseRef.current = pause;
  }, [pause]);

  useEffect(() => {
    const publish = () => pauseRef.current();

    // Wrapped in an updater: jotai treats a bare function value as a
    // reducer, so `setHandle(publish)` would store `publish(prev)`'s result.
    setHandle(() => publish);

    return () => {
      setHandle((current) => (current === publish ? null : current));
    };
  }, [setHandle]);
};

/**
 * Request that the active timeline pause, from anywhere in the app.
 *
 * A no-op when nothing is mounted, so callers need no media-type check. The
 * returned callback is stable for as long as the handle is.
 */
export const useRequestPlaybackPause = (): (() => void) => {
  const pause = useAtomValue(playbackPauseHandleAtom, { store });

  return useCallback(() => pause?.(), [pause]);
};

/**
 * Whether the active timeline is playing, published for the same callers and
 * for the same reason as the pause handle above.
 *
 * `useIsPlaying()` is not an option outside the provider: it resolves the
 * per-instance store through `usePlaybackStore()`, which THROWS when there is
 * no `<PlaybackProvider>` above it.
 *
 * False whenever no timeline is mounted, which is the normal state for an
 * image sample — so consumers need no media-type check.
 */
const playbackIsPlayingAtom = atom<boolean>(false);

/** Publish this provider's playing flag. Called by `PlaybackProvider`. */
export const usePublishIsPlaying = (isPlaying: boolean): void => {
  const setIsPlaying = useSetAtom(playbackIsPlayingAtom, { store });

  useEffect(() => {
    setIsPlaying(isPlaying);
  }, [isPlaying, setIsPlaying]);

  useEffect(
    () => () => {
      setIsPlaying(false);
    },
    [setIsPlaying],
  );
};

/** Whether the active timeline is playing, from anywhere in the app. */
export const useIsPlaybackPlaying = (): boolean =>
  useAtomValue(playbackIsPlayingAtom, { store });
