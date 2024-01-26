export class Load<K> extends Event {
  constructor(readonly page: K) {
    super("load");
  }
}

export class PageChange<K> extends Event {
  constructor(readonly page: K) {
    super("pagechange");
  }
}

interface EventListener<E extends Event> {
  (evt: E): void;
}

interface EventListenerObject<E extends Event> {
  handleEvent(object: E): void;
}

export type EventCallback<E extends Event> =
  | EventListener<E>
  | EventListenerObject<E>;
