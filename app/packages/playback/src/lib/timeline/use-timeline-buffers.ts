import { useAtomValue } from "jotai";
import React from "react";
import {
  getCurrentBufferingRangeAtom,
  getDataLoadedBuffersAtom,
  TimelineName,
} from "./state";
import { useDefaultTimelineNameImperative } from "./use-default-timeline-name";

/**
 * This hook provides access to the range load buffers of a timeline.
 *
 *
 * @param name - The name of the timeline to access. Defaults to the global timeline
 * scoped to the current modal.
 */
export const useTimelineBuffers = (name?: TimelineName) => {
  const { getName } = useDefaultTimelineNameImperative();

  const timelineName = React.useMemo(() => name ?? getName(), [name, getName]);

  const dataLoadedBufferManager = useAtomValue(
    getDataLoadedBuffersAtom(timelineName)
  );

  const currentLoadingRange = useAtomValue(
    getCurrentBufferingRangeAtom(timelineName)
  );

  return {
    /**
     * The loaded buffers of the timeline.
     */
    loaded: dataLoadedBufferManager.buffers,
    /**
     * The currently loading range of the timeline.
     */
    loading: currentLoadingRange,
  };
};
