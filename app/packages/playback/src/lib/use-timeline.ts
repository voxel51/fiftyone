import { useAtomValue, useSetAtom } from "jotai";
import React from "react";
import { GLOBAL_TIMELINE_ID } from "../lib/constants";
import {
  addSubscriberAtom,
  getFrameNumberAtom,
  getPlayheadStateAtom,
  getTimelineConfigAtom,
  PlayheadState,
  TimelineName,
  updatePlayheadStateAtom,
} from "../lib/state";

/**
 * This hook provides access to the timeline with the given name.
 *
 * No side-effects are performed in this hook and so it can be called
 * multiple times in any component without any issues.
 *
 * @param name - The name of the timeline to access. Defaults to the global timeline
 * scoped to the current modal.
 */
export const useTimeline = (name: TimelineName = GLOBAL_TIMELINE_ID) => {
  const config = useAtomValue(getTimelineConfigAtom(name));
  const playHeadState = useAtomValue(getPlayheadStateAtom(name));
  const setPlayheadStateWrapper = useSetAtom(updatePlayheadStateAtom);
  const frameNumber = useAtomValue(getFrameNumberAtom(name));
  const subscribe = useSetAtom(addSubscriberAtom);

  const setPlayHeadState = React.useCallback((newState: PlayheadState) => {
    setPlayheadStateWrapper({ name, state: newState });
  }, []);

  const play = React.useCallback(() => {
    dispatchEvent(new CustomEvent("play", { detail: { timelineName: name } }));
  }, [name]);

  const pause = React.useCallback(() => {
    dispatchEvent(new CustomEvent("pause", { detail: { timelineName: name } }));
  }, [name]);

  return {
    config,
    frameNumber,
    playHeadState,
    play,
    pause,
    setPlayHeadState,
    subscribe,
  };
};
