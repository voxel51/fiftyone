import { useCallback, useEffect, useRef, useState } from "react";
import {
  dispatchTimelineSetFrameNumberEvent,
  useDefaultTimelineNameImperative,
  useTimeline,
} from "@fiftyone/playback";

const SUBSCRIPTION_ID = "temporal-embedding-trajectory-cursor";

/**
 * Bidirectional sync with the active video timeline.
 *
 * - Reads: subscribes to frame updates via useTimeline so the panel
 *   re-renders when the user scrubs the video.
 * - Writes: returns a `seekFrame` callback that drives the *video element*
 *   via dispatchTimelineSetFrameNumberEvent. The plain setFrameNumberAtom
 *   only updates Jotai subscribers (us, but not the looker), so we have
 *   to fire the DOM CustomEvent the looker listens for to actually move
 *   the playhead. The atom catches up via the looker's own callback
 *   once it has seeked.
 *
 * Returns null currentFrame when there's no active timeline (e.g.
 * panel is open in grid mode without a modal video).
 */
export function useFrameSync() {
  const { getName } = useDefaultTimelineNameImperative();
  const timelineName = getName();

  const { subscribe, isTimelineInitialized } = useTimeline(timelineName);

  const [currentFrame, setCurrentFrame] = useState<number | null>(null);
  const currentFrameRef = useRef<number | null>(null);
  currentFrameRef.current = currentFrame;

  const renderFrame = useCallback((frameNumber: number) => {
    if (currentFrameRef.current !== frameNumber) {
      setCurrentFrame(frameNumber);
    }
  }, []);

  useEffect(() => {
    if (!isTimelineInitialized) return;
    subscribe({
      id: SUBSCRIPTION_ID,
      loadRange: async () => {
        /* nothing to preload — points are already in memory */
      },
      renderFrame,
    });
  }, [isTimelineInitialized, subscribe, renderFrame]);

  const seekFrame = useCallback(
    (frameNumber: number) => {
      if (!timelineName) return;
      dispatchTimelineSetFrameNumberEvent({
        timelineName,
        newFrameNumber: frameNumber,
      });
    },
    [timelineName]
  );

  return {
    currentFrame,
    seekFrame,
    timelineName,
    isTimelineActive: isTimelineInitialized,
  };
}
