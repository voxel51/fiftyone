import { useSetAtom } from "jotai";
import React from "react";
import { setFrameNumberAtom, TimelineName } from "./state";
import { useDefaultTimelineNameImperative } from "./use-default-timeline-name";
import { useFrameNumber } from "./use-frame-number";
import { useTimeline } from "./use-timeline";

/**
 * This hook provides access to some utilties that could be used
 * to render a visualization of the timeline.
 *
 *
 * @param name - The name of the timeline to access. Defaults to the global timeline
 * scoped to the current modal.
 */
export const useTimelineVizUtils = (name?: TimelineName) => {
  const { getName } = useDefaultTimelineNameImperative();

  const timelineName = React.useMemo(() => name ?? getName(), [name, getName]);

  const { config } = useTimeline(timelineName);
  const frameNumber = useFrameNumber(timelineName);

  const setFrameNumber = useSetAtom(setFrameNumberAtom);

  const getSeekValue = React.useCallback(
    () => convertFrameNumberToPercentage(frameNumber, config.totalFrames),
    [frameNumber, config?.totalFrames]
  );

  const seekTo = React.useCallback(
    (newSeekValue: number) => {
      const newFrameNumber = Math.max(
        Math.ceil((newSeekValue / 100) * config.totalFrames),
        1
      );
      setFrameNumber({ name: timelineName, newFrameNumber });
    },
    [setFrameNumber, timelineName, config?.totalFrames]
  );

  return {
    getSeekValue,
    seekTo,
  };
};

export const convertFrameNumberToPercentage = (
  frameNumber: number,
  totalFrames: number
) => {
  // offset by -1 since frame indexing is 1-based
  const numerator = frameNumber - 1;
  const denominator = totalFrames - 1;

  if (denominator <= 0) {
    return 0;
  }

  return (numerator / denominator) * 100;
};
