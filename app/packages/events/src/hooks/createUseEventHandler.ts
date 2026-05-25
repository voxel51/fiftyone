import { useEffect } from "react";
import { DEFAULT_CHANNEL_ID } from "../dispatch";
import { EventGroup, EventHandler } from "../types";
import { useEventBus } from "./useEventBus";

/**
 * Options for configuring event handler behavior.
 */
type UseEventHandlerOptions = {
  /**
   * If true, the handler will unregister itself after firing once.
   * If the component unmounts before the event fires, the handler is still cleaned up.
   * @default false
   */
  once?: boolean;
};

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
 *   // ⚠️ IMPORTANT: Always wrap handlers in useCallback to avoid unnecessary re-renders
 *   // Using useCallback directly as the second argument provides type inference
 *   useDemoEventHandler("demo:eventA", useCallback((data) => {
 *     console.log(data.id, data.name); // data is automatically typed
 *   }, []));
 *
 *   useDemoEventHandler("demo:eventD", useCallback(() => {
 *     console.log("Event D received");
 *   }, []));
 *
 *   // One-time handler — automatically unregisters after the first event
 *   useDemoEventHandler("demo:eventA", useCallback((data) => {
 *     console.log("fires once:", data.id);
 *   }, []), { once: true });
 *
 *   return <div>...</div>;
 * }
 * ```
 *
 * @remarks
 * **⚠️ IMPORTANT**: Always wrap your handler functions in `useCallback` to ensure
 * referential stability. Without `useCallback`, the handler will be a new function reference
 * on every render, causing the event handler to be unregistered and re-registered unnecessarily,
 * which can lead to performance issues and missed events.
 *
 * You can use `useCallback` directly as the second argument to get automatic type inference
 * for the handler's data parameter, and this pattern doesn't violate the rules of hooks.
 */
export function createUseEventHandler<T extends EventGroup>(
  channelId = DEFAULT_CHANNEL_ID
) {
  return function useEventHandler<K extends keyof T>(
    event: K,
    handler: EventHandler<T[K]>,
    { once = false }: UseEventHandlerOptions = {}
  ) {
    const bus = useEventBus<T>(channelId);

    useEffect(() => {
      if (once) {
        return bus.once(event, handler);
      }

      bus.on(event, handler);
      return () => bus.off(event, handler);
    }, [bus, event, handler, once]);
  };
}
