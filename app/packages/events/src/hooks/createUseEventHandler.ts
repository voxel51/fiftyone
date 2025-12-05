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
