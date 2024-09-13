import { useAtomValue } from "jotai";
import { useEffect, useMemo } from "react";
import {
  _INTERNAL_timelineConfigsLruCache,
  getFrameNumberAtom,
  getTimelineConfigAtom,
  TimelineName,
} from "./state";
import { useDefaultTimelineName } from "./use-default-timeline-name";

/**
 * This hook provides the current frame number of the timeline with the given name.
 *
 * @param name - The name of the timeline to access. Defaults to the global timeline
 * scoped to the current modal.
 */
export const useFrameNumber = (name?: TimelineName) => {
  const { getName } = useDefaultTimelineName();

  const timelineName = useMemo(() => name ?? getName(), [name, getName]);

  const { __internal_IsTimelineInitialized: isTimelineInitialized } =
    useAtomValue(getTimelineConfigAtom(timelineName));

  const frameNumber = useAtomValue(getFrameNumberAtom(timelineName));

  useEffect(() => {
    // this is so that this timeline is brought to the front of the cache
    _INTERNAL_timelineConfigsLruCache.get(timelineName);
  }, [timelineName]);

  if (!isTimelineInitialized) {
    return -1;
  }

  return frameNumber;
};
