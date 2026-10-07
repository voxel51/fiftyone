import { EventDispatcher } from "./dispatcher";

/** What a {@link LocalEventTarget} listener receives for a non-DOM payload */
export type LocalEvent<T = unknown> = {
  readonly type: string;
  readonly detail: T;
};

type Listener = EventListenerOrEventListenerObject;

/**
 * An EventTarget-shaped facade over a private event bus, for an object whose
 * listeners attach to it alone (a looker, a grid item). A listener receives
 * `{ type, detail }`, or the DOM event itself when one is dispatched (an
 * `ErrorEvent`, a forwarded pointer event). Listeners run synchronously, in
 * the order they were added.
 */
export class LocalEventTarget {
  private readonly bus = new EventDispatcher<Record<string, unknown>>();
  private readonly removers = new Map<string, Map<Listener, () => void>>();

  dispatch(type: string, detail?: unknown): void {
    this.bus.dispatch(type, detail);
  }

  addEventListener(
    type: string,
    listener: Listener | null,
    options?: boolean | AddEventListenerOptions,
  ): void {
    if (!listener) return;
    const { once = false, signal } =
      typeof options === "object" ? options : ({} as AddEventListenerOptions);
    if (signal?.aborted) return;

    let byListener = this.removers.get(type);
    if (!byListener) {
      byListener = new Map();
      this.removers.set(type, byListener);
    }
    // an EventTarget ignores a listener added twice
    if (byListener.has(listener)) return;

    const off = this.bus.on(type, (payload) => {
      if (once) remove();
      const event = (
        payload instanceof Event ? payload : { type, detail: payload }
      ) as Event;
      if (typeof listener === "function") {
        listener(event);
      } else {
        listener.handleEvent(event);
      }
    });
    const remove = () => {
      off();
      byListener.delete(listener);
      signal?.removeEventListener("abort", remove);
    };
    signal?.addEventListener("abort", remove, { once: true });
    byListener.set(listener, remove);
  }

  removeEventListener(type: string, listener: Listener | null): void {
    if (listener) this.removers.get(type)?.get(listener)?.();
  }
}
