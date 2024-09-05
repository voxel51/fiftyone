import { useAtomValue } from "jotai";
import React from "react";
import { GLOBAL_TIMELINE_ID } from "./constants";
import {
  getFrameNumberAtom,
  getTimelineConfigAtom,
  TimelineName,
} from "./state";

/**
 * This hook provides access to some utilties that could be used
 * to render a visualization of the timeline.
 *
 *
 * @param name - The name of the timeline to access. Defaults to the global timeline
 * scoped to the current modal.
 */
export const useTimelineVizUtils = (
  name: TimelineName = GLOBAL_TIMELINE_ID
) => {
  const config = useAtomValue(getTimelineConfigAtom(name));
  const frameNumber = useAtomValue(getFrameNumberAtom(name));

  const getSeekValue = React.useCallback(() => {
    // offset by -1 since frame indexing is 1-based
    const numerator = frameNumber - 1;
    const denominator = config.totalFrames - 1;
    return (numerator / denominator) * 100;
  }, [frameNumber]);

  return {
    getSeekValue,
  };
};
