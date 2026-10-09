import { FrameTemporalView, useAnnotationEngine } from "@fiftyone/annotation";
import { useEffect } from "react";
import { useFrameClock } from "./useFrameClock";

/**
 * Install a frame-temporal view on the shared annotation engine for the lifetime
 * of the video surface, driven by the playback clock. Mirrors the engine's store
 * lifecycle ({@link useSyncAnnotationEngine}): attach on mount, detach (restore
 * the pool view) on unmount. The clock yields frame numbers directly, so the
 * engine's time→frame map is identity.
 *
 * Must be mounted inside a `PlaybackProvider` (see {@link useFrameClock}).
 *
 * @param sampleSpan - For a clip sample, its support `[first, last]`: the
 *   frames outside which sample-level labels are absent (they describe the
 *   clip, not the parent video). `null` for a whole video.
 */
export const useSyncAnnotationFrameClock = (
  sampleSpan: readonly [number, number] | null = null,
): void => {
  const engine = useAnnotationEngine();
  const clock = useFrameClock();
  const [first, last] = sampleSpan ?? [null, null];

  useEffect(
    () =>
      engine.attachTemporal(
        (e) =>
          new FrameTemporalView(
            e,
            clock,
            (time) => time,
            first !== null && last !== null ? [first, last] : null,
          ),
      ),
    // destructured so a fresh tuple with the same frames doesn't reattach
    [engine, clock, first, last],
  );
};
