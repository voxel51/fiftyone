import { useEffect } from "react";
import { EventGroup, EventHandler } from "../types";
import { useEventBus } from "./useEventBus";

/**
 * Factory function that creates a type-safe event handler hook.
 * The returned hook automatically registers/unregisters handlers on mount/unmount.
 *
 * @template T - EventGroup type defining event types and payloads
 * @returns A hook function that registers event handlers with automatic cleanup
 *
 * @example
 * ```typescript
 * type DemoEventGroup = {
 *   "demo:eventA": { id: string; name: string };
 *   "demo:eventD": undefined;
 * };
 * const useDemoEventHandler = createUseEventHandler<DemoEventGroup>();
 *
 * function Component() {
 *   useDemoEventHandler("demo:eventA", (data) => console.log(data.id, data.name));
 *   useDemoEventHandler("demo:eventD", () => console.log("Event D received"));
 *   return <div>...</div>;
 * }
 * ```
 */
export function createUseEventHandler<T extends EventGroup>() {
  return function useEventHandler<K extends keyof T>(
    event: K,
    handler: EventHandler<T[K]>
  ) {
    const bus = useEventBus<T>();

    useEffect(() => {
      bus.on(event, handler);
      return () => bus.off(event, handler);
    }, [bus, event, handler]);
  };
}
