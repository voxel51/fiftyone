import { EventFamily, EventHandler } from "../types";

type HandlerMap<T extends EventFamily> = {
  [E in keyof T]?: EventHandler<T[E]>[];
};

export class EventDispatcher<T extends EventFamily> {
  private readonly handlers: HandlerMap<T> = {};

  public on<E extends keyof T>(event: E, handler: EventHandler<T[E]>): void {
    if (!this.handlers[event]) {
      this.handlers[event] = [];
    }

    this.handlers[event].push(handler);
  }

  public off<E extends keyof T>(event: E, handler: EventHandler<T[E]>): void {
    if (this.handlers[event]) {
      const index = this.handlers[event].indexOf(handler);
      if (index >= 0) {
        this.handlers[event].splice(index, 1);
      }
    }
  }

  public dispatch<E extends keyof T>(event: E, data: T[E]): void {
    this.handlers[event]?.forEach((handler) => {
      try {
        handler(data);
      } catch (error) {
        console.error(`error handling event '${event}'`, error);
      }
    });
  }
}
