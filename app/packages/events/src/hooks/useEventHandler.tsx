import { useEffect } from "react";
import { EventFamily, EventHandler } from "../types";
import { useEventBus } from "./useEventBus";

export function createUseEventHandler<T extends EventFamily>(
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
