import type { Clock } from "@fiftyone/annotation";
import { useTimeline } from "@fiftyone/playback";
import { useId, useMemo } from "react";

/**
 * Adapts the modal playback timeline to the annotation engine's {@link Clock}.
 * The timeline already yields a frame number, so `getTime` returns the frame and
 * the engine's `frameAtTime` is identity (seconds-based time only matters for
 * multi-fps sync, deferred). `subscribe` returns a real teardown via the
 * timeline's `unsubscribe`, so the temporal view disposes cleanly; a per-hook
 * `useId` keeps the subscription id unique across modals and strict-mode remounts.
 *
 * Must be called inside a `PlaybackProvider`. `getFrameNumber` returns -1 until
 * the timeline initializes — the engine reads that as an empty present-set.
 */
export const useFrameClock = (): Clock => {
  const { getFrameNumber, subscribe, unsubscribe } = useTimeline();
  const id = useId();

  return useMemo<Clock>(
    () => ({
      getTime: () => getFrameNumber(),
      subscribe: (listener) => {
        subscribe({
          id,
          loadRange: async () => {},
          renderFrame: (frameNumber) => listener(frameNumber),
        });

        return () => unsubscribe(id);
      },
    }),
    [getFrameNumber, subscribe, unsubscribe, id]
  );
};
