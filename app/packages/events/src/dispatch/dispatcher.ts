import { EventGroup, EventHandler } from "../types";

type DispatchData<T> = T extends undefined | null ? [data?: T] : [data: T];

/**
 * Map from event types to their registered handlers.
 */
type HandlerMap<T extends EventGroup> = {
  [E in keyof T]?: EventHandler<T[E]>[];
};

/**
 * Type-safe event dispatcher.
 *
 * **⚠️ In most cases, you should not instantiate this class directly.**
 * - For **JavaScript/TypeScript** code (non-React): use {@link getEventBus} to get a shared event bus instance
 * - For **React components**: use the {@link useEventBus} hook instead
 *
 * This class is exported primarily for advanced use cases where you need a completely isolated
 * event dispatcher instance, or for internal use within the event system.
 *
 * @template T - EventGroup type defining event types and payloads
 *
 * @example
 * ```typescript
 * // ✅ Recommended: Use getEventBus for JavaScript/TypeScript
 * import { getEventBus } from "./hooks";
 * const eventBus = getEventBus<DemoEventGroup>();
 *
 * // ✅ Recommended: Use useEventBus for React components
 * import { useEventBus } from "./hooks";
 * function MyComponent() {
 *   const eventBus = useEventBus<DemoEventGroup>();
 * }
 *
 * // ⚠️ Advanced: Direct instantiation (rarely needed)
 * const eventBus = new EventDispatcher<DemoEventGroup>();
 * ```
 */
export class EventDispatcher<T extends EventGroup> {
  private readonly handlers: HandlerMap<T> = {};

  /**
   * Registers an event handler.
   * Handlers can be synchronous or asynchronous. Async handlers run in parallel and don't block other handlers.
   *
   * @template E - Event type key
   * @param event - Event type name
   * @param handler - Handler function (sync or async)
   *
   * @returns A function to unregister the handler
   *
   * @example
   * ```typescript
   * // Synchronous handler
   * const syncHandler = (data: DemoEventGroup["demo:eventA"]) => console.log(data.id);
   * const unregister = eventBus.on("demo:eventA", syncHandler);
   * unregister();
   *
   * // Asynchronous handler
   * const unregister = eventBus.on("demo:eventA", async (data) => {
   *   await fetch(`/api/events/${data.id}`);
   * });
   * unregister();
   *
   * // No payload
   * const unregister = eventBus.on("demo:eventD", () => console.log("no payload"));
   * unregister();
   * ```
   */
  public on<E extends keyof T>(
    event: E,
    handler: EventHandler<T[E]>
  ): () => void {
    const handlers = this.handlers[event];

    if (handlers) {
      if (!handlers.includes(handler)) {
        handlers.push(handler);
      }
    } else {
      this.handlers[event] = [handler];
    }

    return () => this.off(event, handler);
  }

  /**
   * Unregisters an event handler.
   *
   * @template E - Event type key
   * @param event - Event type name
   * @param handler - Handler to remove
   *
   * @example
   * ```typescript
   * eventBus.off("demo:eventA", handler); // Remove specific handler
   * ```
   */
  public off<E extends keyof T>(event: E, handler: EventHandler<T[E]>): void {
    const handlers = this.handlers[event];

    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Removes all handlers for an event type.
   *
   * @template E - Event type key
   * @param event - Event type name
   *
   * @example
   * ```typescript
    // Remove all handlers
   * eventBus.clear("demo:eventB");
   * ```
   */
  public clear<E extends keyof T>(event: E): void {
    this.handlers[event] = [];
  }

  /**
   * Dispatches an event to all registered handlers.
   *
   * @template E - Event type key
   * @param event - Event type name
   * @param args - Event payload (optional if event type is undefined/null)
   *
   * @example
   * ```typescript
   * // Synchronous handlers
   * eventBus.dispatch("demo:eventA", { id: "some-id", name: "some-name" });
   * eventBus.dispatch("demo:eventB", { value: 42 });
   *
   * // No payload
   * eventBus.dispatch("demo:eventD");
   *
   * // Async handlers are supported and run in parallel
   * eventBus.on("demo:eventA", async (data) => {
   *   await fetch(`/api/events/${data.id}`);
   * });
   * ```
   */
  public dispatch<E extends keyof T>(
    event: E,
    ...args: DispatchData<T[E]>
  ): void {
    const data = args[0] as T[E];
    const typeHandlers = this.handlers[event];
    if (!typeHandlers || typeHandlers.length === 0) {
      return;
    }

    // Collect all handler results (sync handlers return void, async return Promise<void>)
    const promises = typeHandlers.map((handler) => {
      try {
        const result = handler(data);
        // If handler returns a Promise, return it; otherwise wrap void in resolved Promise
        return result instanceof Promise ? result : Promise.resolve();
      } catch (error) {
        // Sync handler threw synchronously - return rejected promise
        return Promise.reject(error);
      }
    });

    // Wait for all handlers to settle (complete or reject) without blocking dispatch
    // This ensures all handlers run in parallel and errors don't prevent others from running
    Promise.allSettled(promises).then((results) => {
      results.forEach((result, index) => {
        if (result.status === "rejected") {
          console.error(
            `error handling event '${String(event)}' in handler ${index}`,
            result.reason
          );
        }
      });
    });
  }
}
