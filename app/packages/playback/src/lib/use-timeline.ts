import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo } from "react";
import {
  _INTERNAL_timelineConfigsLruCache,
  addSubscriberAtom,
  getFrameNumberAtom,
  getPlayheadStateAtom,
  getTimelineConfigAtom,
  PlayheadState,
  SequenceTimelineSubscription,
  TimelineName,
  updatePlayheadStateAtom,
} from "../lib/state";
import { useDefaultTimelineName } from "./use-default-timeline-name";

/**
 * This hook provides access to the timeline with the given name.
 *
 * No side-effects are performed in this hook and so it can be called
 * multiple times in any component without any issues.
 *
 * @param name - The name of the timeline to access. Defaults to the global timeline
 * scoped to the current modal.
 */
export const useTimeline = (name?: TimelineName) => {
  const { getName } = useDefaultTimelineName();

  const timelineName = useMemo(() => name ?? getName(), [name, getName]);

  const { __internal_IsTimelineInitialized: isTimelineInitialized, ...config } =
    useAtomValue(getTimelineConfigAtom(timelineName));
  const playHeadState = useAtomValue(getPlayheadStateAtom(timelineName));
  const setPlayheadStateWrapper = useSetAtom(updatePlayheadStateAtom);
  const frameNumber = useAtomValue(getFrameNumberAtom(timelineName));
  const subscribeImpl = useSetAtom(addSubscriberAtom);

  useEffect(() => {
    // this is so that this timeline is brought to the front of the cache
    _INTERNAL_timelineConfigsLruCache.get(timelineName);
  }, []);

  const setPlayHeadState = useCallback((newState: PlayheadState) => {
    setPlayheadStateWrapper({ name: timelineName, state: newState });
  }, []);

  const play = useCallback(() => {
    dispatchEvent(
      new CustomEvent("play", { detail: { timelineName: timelineName } })
    );
  }, [timelineName]);

  const pause = useCallback(() => {
    dispatchEvent(
      new CustomEvent("pause", { detail: { timelineName: timelineName } })
    );
  }, [timelineName]);

  const subscribe = useCallback(
    (subscription: SequenceTimelineSubscription) => {
      subscribeImpl({ name: timelineName, subscription });
    },
    [subscribeImpl, timelineName]
  );

  return {
    config,
    frameNumber,
    isTimelineInitialized,
    playHeadState,
    play,
    pause,
    setPlayHeadState,
    subscribe,
  };
};
