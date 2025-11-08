import { EventGroup, EventHandler } from "../types";
import { useEffect } from "react";
import { useEventBus } from "./useEventBus";

export const useEventHandler = <T extends EventGroup, E extends keyof T>(
  event: E,
  handler: EventHandler<T[E]>,
  channelId: string = "default"
) => {
  const eventBus = useEventBus<T>({ channelId });

  useEffect(() => {
    eventBus.on(event, handler);

    return () => eventBus.off(event, handler);
  }, [event, eventBus, handler]);
};
