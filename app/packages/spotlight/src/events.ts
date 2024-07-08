/**
 * Copyright 2017-2024, Voxel51, Inc.
 */

export class Load<K> extends Event {
  constructor(readonly page: K) {
    super("load");
  }
}

export class RowChange<K> extends Event {
  constructor(readonly at: symbol, readonly page: K) {
    super("rowchange");
  }
}

type EventListener<E extends Event> = (evt: E) => void;

interface EventListenerObject<E extends Event> {
  handleEvent(object: E): void;
}

export type EventCallback<E extends Event> =
  | EventListener<E>
  | EventListenerObject<E>;
