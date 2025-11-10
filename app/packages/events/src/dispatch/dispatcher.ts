import { EventGroup, EventHandler } from "../types";

type DispatchData<T> = T extends undefined | null ? [data?: T] : [data: T];

/**
 * Map from event types to their registered handlers.
 * Note: Set maintains insertion order (ES2015+).
 */
type HandlerMap<T extends EventGroup> = Map<
  keyof T,
  Set<EventHandler<T[keyof T]>>
>;

/**
 * Type-safe event dispatcher.
 *
 * @template T - EventGroup type defining event types and payloads
 *
 * @example
 * ```typescript
 * type DemoEventGroup = {
 *   "demo:eventA": { id: string; name: string };
 *   "demo:eventD": undefined;
 * };
 *
 * const eventBus = new EventDispatcher<DemoEventGroup>();
 * const handler = (data: DemoEventGroup["demo:eventA"]) => console.log(data.id);
 * eventBus.on("demo:eventA", handler);
 * eventBus.dispatch("demo:eventA", { id: "some-id", name: "some-name" });
 * eventBus.off("demo:eventA", handler);
 * ```
 */
export class EventDispatcher<T extends EventGroup> {
  private readonly handlers: HandlerMap<T> = new Map();

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
    const handlers = this.handlers.get(event);
    if (handlers) {
      handlers.add(handler);
    } else {
      this.handlers.set(event, new Set([handler]));
    }
  }

  /**
   * Unregisters an event handler. If no handler provided, removes all handlers for the event.
   *
   * @template E - Event type key
   * @param event - Event type name
   * @param handler - Optional handler to remove
   *
   * @example
   * ```typescript
   * eventBus.off("demo:eventA", handler); // Remove specific handler
   * eventBus.off("demo:eventB"); // Remove all handlers
   * ```
   */
  public off<E extends keyof T>(event: E, handler?: EventHandler<T[E]>): void {
    const handlers = this.handlers.get(event);

    if (handlers) {
      if (handler) {
        handlers.delete(handler);
      } else {
        // Remove all handlers for this event type
        this.handlers.set(event, new Set());
      }
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
   * eventBus.dispatch("demo:eventA", { id: "some-id", name: "some-name" });
   * eventBus.dispatch("demo:eventB", { value: 42 });
   * eventBus.dispatch("demo:eventD"); // No payload
   * ```
   */
  public dispatch<E extends keyof T>(
    event: E,
    ...args: DispatchData<T[E]>
  ): void {
    const data = args[0] as T[E];
    const typeHandlers = this.handlers.get(event);
    if (typeHandlers) {
      // Array.from() preserves Set's insertion order, ensuring handlers
      // are invoked in registration order
      const handlersArray = Array.from(typeHandlers);
      handlersArray.forEach((handler) => {
        try {
          handler(data);
        } catch (error) {
          console.error(`error handling event '${String(event)}'`, error);
        }
      });
    }
  }
}
