/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { getTime, type VideoLooker } from "@fiftyone/looker";
import { usePlayback } from "@fiftyone/playback";
import { useCallback, useEffect, useRef } from "react";

/**
 * Keeps the timeline's playhead on the looker's frame while paused, and
 * returns the seek the timeline uses to move the looker.
 *
 * While playing, the clock source already reads the looker's frame. While
 * paused, the looker can still change frames on its own (its 0-9 seek keys,
 * or opening a clip on its support start), and the playhead has to follow.
 * Frames the timeline asked for itself are skipped, so a scrub is not echoed
 * back as a second seek.
 */
export function useLookerFrameSync(
  looker: VideoLooker,
  frameRate: number | undefined,
): (frameNumber: number) => void {
  const { seek } = usePlayback();
  // the timeline starts at time 0, which is frame 1
  const requestedRef = useRef(1);

  useEffect(() => {
    if (!frameRate) {
      return undefined;
    }

    const sync = () => {
      const frame = looker.frameNumber;
      if (looker.state.playing || frame === requestedRef.current) {
        return;
      }

      requestedRef.current = frame;
      seek(getTime(frame, frameRate));
    };

    const unsubscribe = looker.subscribeToState("frameNumber", sync);
    looker.addEventListener("load", sync);

    return () => {
      unsubscribe();
      looker.removeEventListener("load", sync);
    };
  }, [looker, frameRate, seek]);

  return useCallback(
    (frameNumber: number) => {
      requestedRef.current = frameNumber;
      looker.seekToFrame(frameNumber);
    },
    [looker],
  );
}
