import { useTriggerPanelEvent } from "@fiftyone/operators";
import { useMemo, useRef } from "react";

/**
 * Given a record of keys to event names, returns a record of trigger functions.
 * Follows the VAL panel pattern for frontend-to-panel communication.
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
      result[k] = ((payload?: any) =>
        safeTrigger(trigger, eventMapRef.current[k], payload)) as T[typeof k];
    }

    return result;
    // eventMap keys are static — only trigger identity matters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);
}

function safeTrigger(
  trigger: (eventName: string, payload?: any) => void,
  eventName: string,
  payload?: any
) {
  if (payload?._reactName) {
    // Support <button onClick={triggers.myTrigger} />
    // by ignoring react synthetic events
    payload = undefined;
  }
  return trigger(eventName, payload);
}
