import { useTriggerPanelEvent } from "@fiftyone/operators";
import { useMemo, useRef } from "react";

type TriggerOptions = {
  onSettled?: (result?: { result?: unknown; error?: unknown }) => void;
};

/**
 * Given a record of {triggerName: eventName}, returns a record of
 * functions that fire the panel event. Mirrors similarity-search's
 * useTriggers but kept local for clarity.
 */
export default function useTriggers<
  T extends Record<string, (...args: any[]) => void>
>(eventMap: { [K in keyof T]: string }): T {
  const trigger = useTriggerPanelEvent();
  const eventMapRef = useRef(eventMap);
  eventMapRef.current = eventMap;

  return useMemo(() => {
    const result = {} as T;
    for (const key in eventMapRef.current) {
      const k = key;
      result[k] = ((payload?: any, options?: TriggerOptions) =>
        safeTrigger(
          trigger,
          eventMapRef.current[k],
          payload,
          options
        )) as T[typeof k];
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);
}

function safeTrigger(
  trigger: (
    eventName: string,
    payload?: any,
    prompt?: boolean,
    callback?: (result?: { result?: unknown; error?: unknown }) => void
  ) => void,
  eventName: string,
  payload?: any,
  options?: TriggerOptions
) {
  if (payload?._reactName) {
    payload = undefined;
  }
  return trigger(eventName, payload, undefined, options?.onSettled);
}
