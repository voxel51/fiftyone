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
   *
   * @template E - Event type key
   * @param event - Event type name
   * @param handler - Handler function
   *
   * @example
   * ```typescript
   * const handler = (data: DemoEventGroup["demo:eventA"]) => console.log(data.id);
   * eventBus.on("demo:eventA", handler);
   * eventBus.on("demo:eventD", () => console.log("no payload"));
   * ```
   */
  public on<E extends keyof T>(event: E, handler: EventHandler<T[E]>): void {
    const handlers = this.handlers[event];

    if (handlers) {
      if (!handlers.includes(handler)) {
        handlers.push(handler);
      }
    } else {
      this.handlers[event] = [handler];
    }
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
   * eventBus.dispatch("demo:eventA", { id: "some-id", name: "some-name" });
   * eventBus.dispatch("demo:eventB", { value: 42 });
    // No payload
   * eventBus.dispatch("demo:eventD");
   * ```
   */
  public dispatch<E extends keyof T>(
    event: E,
    ...args: DispatchData<T[E]>
  ): void {
    const data = args[0] as T[E];
    const typeHandlers = this.handlers[event];
    if (typeHandlers) {
      typeHandlers.forEach((handler) => {
        try {
          handler(data);
        } catch (error) {
          console.error(`error handling event '${String(event)}'`, error);
        }
      });
    }
  }
}
