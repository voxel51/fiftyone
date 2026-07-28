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
 */
export const useSyncAnnotationFrameClock = (): void => {
  const engine = useAnnotationEngine();
  const clock = useFrameClock();

  useEffect(
    () =>
      engine.attachTemporal(
        (e) => new FrameTemporalView(e, clock, (time) => time),
      ),
    [engine, clock],
  );
};
