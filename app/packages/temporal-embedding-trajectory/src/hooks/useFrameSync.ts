import { useCallback, useEffect, useRef, useState } from "react";
import { useSetAtom } from "jotai";
import {
  setFrameNumberAtom,
  useDefaultTimelineNameImperative,
  useTimeline,
} from "@fiftyone/playback";

const SUBSCRIPTION_ID = "temporal-embedding-trajectory-cursor";

/**
 * Bidirectional sync with the active video timeline.
 *
 * - Reads: subscribes to frame updates via useTimeline so the panel
 *   re-renders when the user scrubs the video.
 * - Writes: returns a `seekFrame` callback that drives the looker via
 *   `setFrameNumberAtom`.
 *
 * Returns null currentFrame when there's no active timeline (e.g.
 * panel is open in grid mode without a modal video).
 */
export function useFrameSync() {
  const { getName } = useDefaultTimelineNameImperative();
  const timelineName = getName();

  const { subscribe, isTimelineInitialized } = useTimeline(timelineName);
  const setFrameNumberDirect = useSetAtom(setFrameNumberAtom);

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
      setFrameNumberDirect({
        name: timelineName,
        newFrameNumber: frameNumber,
      });
    },
    [setFrameNumberDirect, timelineName]
  );

  return {
    currentFrame,
    seekFrame,
    timelineName,
    isTimelineActive: isTimelineInitialized,
  };
}
