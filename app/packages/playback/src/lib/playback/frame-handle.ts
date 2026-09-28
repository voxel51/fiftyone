/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { atom, getDefaultStore, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect } from "react";

/**
 * "No frame": either no timeline is mounted (the normal state for an image
 * sample) or the sample's frame rate is unknown, so seconds cannot be
 * converted to a frame at all. Matches `useCurrentFrame`'s own sentinel so a
 * publisher can forward its value unexamined.
 */
const NO_FRAME = -1;

/**
 * The active timeline's current frame, published for callers that sit OUTSIDE
 * the `PlaybackProvider` and so cannot reach `usePlayhead()`.
 *
 * The motivating case is the same as {@link usePublishPauseHandle}'s: the
 * modal's action bar is a sibling of the media container, not a descendant.
 * "Select visible labels (current frame)" and the label selection the canvas
 * writes both have to agree on which frame "current" means, and the looker
 * they replace got it for free from its own render state
 * (`overlays/base.ts`'s `getSelectData` reads `state.frameNumber`).
 */
const currentFrameAtom = atom<number>(NO_FRAME);

/**
 * Both sides target the process-wide default store EXPLICITLY, for the reason
 * `pause-handle` documents at length: publisher and consumer sit in different
 * subtrees by construction, so "nearest provider wins" would let any
 * `<JotaiProvider>` mounted between them route the write and the read to
 * different stores — and the frame would silently read as absent.
 */
const store = getDefaultStore();

/**
 * Publish the surface's live frame. Called by the video surface, which owns
 * the only conversion from playhead seconds to a frame number.
 *
 * Only one timeline is mounted in the modal at a time (Explore and Annotate
 * swap, they do not coexist), so last-mount-wins is sufficient. Unmount
 * clears the frame so a stale value cannot outlive the surface and get
 * stamped onto a selection made on the next sample.
 */
export const usePublishCurrentFrame = (frame: number): void => {
  const setFrame = useSetAtom(currentFrameAtom, { store });

  useEffect(() => {
    setFrame(frame);
  }, [frame, setFrame]);

  useEffect(
    () => () => {
      setFrame(NO_FRAME);
    },
    [setFrame],
  );
};

/**
 * The live frame, reactive — `undefined` when there is none.
 *
 * Re-renders on every frame while playing, which is what a consumer that must
 * RECONCILE against the frame wants (the canvas/selection sync has to re-run
 * when the playhead moves). Anything that only reads the frame inside a
 * gesture callback should take {@link useCurrentPublishedFrameGetter} instead.
 */
export const useCurrentPublishedFrame = (): number | undefined => {
  const frame = useAtomValue(currentFrameAtom, { store });

  return frame === NO_FRAME ? undefined : frame;
};

/**
 * A referentially-stable getter for the live frame, which does NOT subscribe.
 *
 * For gesture callbacks — a click on an overlay — that must read the frame at
 * call time. Subscribing there would give the callback a new identity on every
 * frame, and callbacks registered on a Lighter event channel are re-registered
 * when their identity changes: a full unsubscribe/subscribe cycle per frame,
 * in the hot path, for a value the handler only reads when the user clicks.
 */
export const useCurrentPublishedFrameGetter = (): (() => number | undefined) =>
  useCallback(() => {
    const frame = store.get(currentFrameAtom);

    return frame === NO_FRAME ? undefined : frame;
  }, []);
