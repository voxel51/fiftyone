import type { EventGroup, EventHandler } from "../types";

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
    handler: EventHandler<T[E]>,
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
   * Registers a one-time event handler that automatically unregisters itself after firing once.
   *
   * @template E - Event type key
   * @param event - Event type name
   * @param handler - Handler function (sync or async)
   *
   * @returns A function to unregister the handler before it fires
   *
   * @remarks
   * The handler passed to `once` is wrapped internally, so the original handler reference
   * is not compatible with `off`. To unregister before the handler fires, use the
   * returned unregister function instead.
   *
   * ```typescript
   * // ❌ Will not work — `off` cannot match the internal wrapper
   * const handler = (data) => console.log(data.id);
   * eventBus.once("demo:eventA", handler);
   * eventBus.off("demo:eventA", handler);
   *
   * // ✅ Use the returned unregister function instead
   * const unregister = eventBus.once("demo:eventA", handler);
   * unregister();
   * ```
   *
   * @example
   * ```typescript
   * // Fires once, then removes itself
   * eventBus.once("demo:eventA", (data) => console.log(data.id));
   *
   * // Cancel before it fires
   * const unregister = eventBus.once("demo:eventA", (data) => console.log(data.id));
   * unregister();
   *
   * // No payload
   * eventBus.once("demo:eventD", () => console.log("fires once"));
   * ```
   */
  public once<E extends keyof T>(
    event: E,
    handler: EventHandler<T[E]>,
  ): () => void {
    const handlerFn = handler as (data?: T[E]) => void | Promise<void>;
    const wrapper: EventHandler<T[E]> = ((data?: T[E]) => {
      this.off(event, wrapper);
      return handlerFn(data);
    }) as EventHandler<T[E]>;

    return this.on(event, wrapper);
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
   * Removes all handlers for all event types.
   *
   * @example
   * ```typescript
   * // Remove all handlers for all events
   * eventBus.clearAll();
   * ```
   */
  public clearAll(): void {
    for (const event in this.handlers) {
      delete this.handlers[event];
    }
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
    if (!this.handlers[event]?.length) {
      return;
    }
    // Make a copy of the handlers at the time of dispatch
    const typeHandlers = [...this.handlers[event]];

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
            result.reason,
          );
        }
      });
    });
  }
}
