import { useEffect } from "react";
import { EventGroup, EventHandler } from "../types";
import { useEventBus } from "./useEventBus";

/**
 * Factory function that creates a type-safe event handler hook.
 * The returned hook automatically registers/unregisters handlers on mount/unmount.
 *
 * **When to use this vs createUseSynchronizedEventState:**
 * - Use `createUseEventHandler` when you need to **react to events with side effects**
 *   (e.g., logging, API calls, navigation, updating local component state via setState)
 * - Use `createUseSynchronizedEventState` when you need to **read and display** the latest event payload
 *   in your component's render (prevents tearing in concurrent React rendering)
 *
 * **Key differences:**
 * - `createUseEventHandler`: Registers callbacks that run when events occur. Useful for
 *   side effects but doesn't provide synchronized state reading across components.
 * - `createUseSynchronizedEventState`: Returns the latest event payload synchronously during render.
 *   Multiple components reading the same event will always see the same synchronized value.
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
 *   // Side effects - use createUseEventHandler
 *   useDemoEventHandler("demo:eventA", (data) => {
 *     console.log(data.id, data.name);
 *     // Could also call setState here, but for state derivation,
 *     // prefer createUseSynchronizedEventState to prevent tearing
 *   });
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
