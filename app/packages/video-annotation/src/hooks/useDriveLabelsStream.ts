import { usePlayback } from "@fiftyone/playback";
import { useEffect } from "react";
import { LABELS_STREAM_ID } from "../utils/ids";

/**
 * Subscribe the frame-labels stream into the playback engine's barrier loop.
 *
 * Registration (`usePlaybackStream`) alone leaves a stream dormant — the engine
 * only drives streams that have at least one subscriber. Subscribing here makes
 * the (blocking) labels stream active, so the engine calls its `prefetch` for
 * the lookahead window as the playhead moves (play / scrub / seek) and gates
 * the commit on label readiness — keeping labels frame-synced with the image
 * stream.
 *
 * Subscribes via the `subscribeStream` action rather than `useStream` because
 * we don't consume the published snapshot (the engine seeds the FrameStore as
 * chunks land, via `subscribeToEdits`) and don't want a per-frame re-render of
 * the surface.
 */
export const useDriveLabelsStream = (): void => {
  const { subscribeStream } = usePlayback();
  useEffect(() => subscribeStream(LABELS_STREAM_ID), [subscribeStream]);
};
