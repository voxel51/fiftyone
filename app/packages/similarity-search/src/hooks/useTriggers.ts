import { useTriggerPanelEvent } from "@fiftyone/operators";
import { useMemo, useRef } from "react";

/**
 * Options for a single trigger invocation.
 *
 * `onSettled` fires with the raw panel-event result (or error) after
 * the backend has responded. Callers can use this to reconcile
 * optimistic UI updates if the backend fails.
 */
export type TriggerOptions = {
  onSettled?: (result?: { result?: unknown; error?: unknown }) => void;
};

/**
 * Given a record of keys to event names, returns a record of trigger functions.
 * Each trigger accepts an optional `TriggerOptions` arg for callbacks.
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
    // eventMap keys are static — only trigger identity matters
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
    // Support <button onClick={triggers.myTrigger} />
    // by ignoring react synthetic events
    payload = undefined;
  }
  return trigger(eventName, payload, undefined, options?.onSettled);
}
