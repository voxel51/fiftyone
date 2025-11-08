import { useEffect } from "react";
import { EventGroup, EventHandler } from "../types";
import { useEventBus } from "./useEventBus";

export function createUseEventHandler<T extends EventGroup>(
  channelId = "default"
) {
  const bus = useEventBus<T>({ channelId });
  return function useEventHandler<K extends keyof T>(
    event: K,
    handler: EventHandler<T[K]>
  ) {
    useEffect(() => {
      bus.on(event, handler);
      return () => bus.off(event, handler);
    }, [bus, event, handler]);
  };
}
