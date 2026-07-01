import type { Clock } from "@fiftyone/annotation";
import { useEffect, useMemo, useRef } from "react";
import { useCurrentFrame } from "../state/useCurrentFrame";

/**
 * Adapts the surface's playback position to the annotation engine's
 * {@link Clock}. The frame comes from {@link useCurrentFrame} (the
 * `PlaybackProvider` engine's playhead), so `getTime` already yields a frame
 * number and the engine's `frameAtTime` is identity.
 *
 * The returned clock is referentially STABLE: `getTime` reads the latest frame
 * through a ref and `subscribe` registers listeners notified by an effect when
 * the frame changes. A stable clock means the `FrameTemporalView` attaches once
 * (no re-attach churn that would reset its present-set each render).
 */
export const useFrameClock = (): Clock => {
  const frame = useCurrentFrame();

  const frameRef = useRef(frame);
  frameRef.current = frame;

  const listeners = useRef(new Set<(time: number) => void>()).current;

  useEffect(() => {
    for (const listener of listeners) {
      listener(frame);
    }
  }, [frame, listeners]);

  return useMemo<Clock>(
    () => ({
      getTime: () => frameRef.current,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    }),
    [listeners],
  );
};
