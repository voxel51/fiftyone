import { useTriggerPanelEvent } from "@fiftyone/operators";
import { useMemo } from "react";

/**
 * Given a record of keys to event names, returns a record of trigger functions.
 * Follows the VAL panel pattern for frontend-to-panel communication.
 */
export default function useTriggers<
  T extends Record<string, (...args: any[]) => void>
>(eventMap: { [K in keyof T]: string }): T {
  const trigger = useTriggerPanelEvent();

  return useMemo(() => {
    const result = {} as T;

    for (const key in eventMap) {
      const eventName = eventMap[key];
      result[key] = ((payload?: any) =>
        safeTrigger(trigger, eventName, payload)) as T[typeof key];
    }

    return result;
  }, [trigger, ...Object.values(eventMap)]);
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
