import { EventGroup, EventHandler } from "../types";

type DispatchData<T> = T extends undefined | null ? [data?: T] : [data: T];

export class EventDispatcher<T extends EventGroup> {
  private readonly handlers: Map<keyof T, Set<EventHandler<T[keyof T]>>> =
    new Map();

  public on<E extends keyof T>(event: E, handler: EventHandler<T[E]>): void {
    const handlers = this.handlers.get(event);
    if (handlers) {
      handlers.add(handler as EventHandler<T[keyof T]>);
    } else {
      this.handlers.set(event, new Set([handler as EventHandler<T[keyof T]>]));
    }
  }

  public off<E extends keyof T>(event: E, handler?: EventHandler<T[E]>): void {
    const handlers = this.handlers.get(event);
    if (handlers) {
      if (handler) {
        handlers.delete(handler as EventHandler<T[keyof T]>);
      } else {
        // Remove all handlers for this event type
        this.handlers.set(event, new Set());
      }
    }
  }

  public dispatch<E extends keyof T>(
    event: E,
    ...args: DispatchData<T[E]>
  ): void {
    const data = args[0] as T[E];
    const typeHandlers = this.handlers.get(event);
    if (typeHandlers) {
      const handlersArray = Array.from(typeHandlers) as EventHandler<T[E]>[];
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
