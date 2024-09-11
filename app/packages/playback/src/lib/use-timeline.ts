import { useAtomValue, useSetAtom } from "jotai";
import { useAtomCallback } from "jotai/utils";
import { useCallback, useEffect, useMemo } from "react";
import {
  _INTERNAL_timelineConfigsLruCache,
  addSubscriberAtom,
  getFrameNumberAtom,
  getPlayheadStateAtom,
  getTimelineConfigAtom,
  PlayheadState,
  SequenceTimelineSubscription,
  setFrameNumberAtom,
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
  const subscribeImpl = useSetAtom(addSubscriberAtom);

  useEffect(() => {
    // this is so that this timeline is brought to the front of the cache
    _INTERNAL_timelineConfigsLruCache.get(timelineName);
  }, [timelineName]);

  const getFrameNumber = useAtomCallback(
    useCallback(
      (get) => {
        const currFramenumber = get(getFrameNumberAtom(timelineName));
        return currFramenumber;
      },
      [timelineName]
    )
  );

  const refresh = useAtomCallback(
    useCallback(
      (get, set) => {
        const currentFrameNumber = get(getFrameNumberAtom(timelineName));

        set(setFrameNumberAtom, {
          name: timelineName,
          newFrameNumber: currentFrameNumber,
        });
      },
      [timelineName]
    )
  );

  useEffect(() => {
    if (!isTimelineInitialized) {
      return;
    }

    queueMicrotask(() => {
      refresh();
    });
  }, [isTimelineInitialized, refresh]);

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

  const setPlayHeadState = useCallback(
    (newState: PlayheadState) => {
      setPlayheadStateWrapper({ name: timelineName, state: newState });
    },
    [timelineName]
  );

  const subscribe = useCallback(
    (subscription: SequenceTimelineSubscription) => {
      subscribeImpl({ name: timelineName, subscription });
    },
    [subscribeImpl, timelineName]
  );

  return {
    config,
    isTimelineInitialized,
    playHeadState,

    /**
     * Imperative way to get the current frame number of the timeline.
     * If you want to subscribe to the frame number, use the `subscribe` method, or
     * use the `useFrameNumber` hook.
     */
    getFrameNumber,
    /**
     * Dispatch a play event to the timeline.
     */
    play,
    /**
     * Dispatch a pause event to the timeline.
     */
    pause,
    /**
     * Reruns renderFrame for all subscribers.
     */
    refresh,
    /**
     * Set the playhead state of the timeline.
     */
    setPlayHeadState,
    /**
     * Subscribe to the timeline for frame updates.
     */
    subscribe,
  };
};
