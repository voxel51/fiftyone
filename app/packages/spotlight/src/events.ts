/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import type { ID } from "./types";

export class Load<K> extends Event {
  constructor(readonly page: K) {
    super("load");
  }
}

export class RowChange<K> extends Event {
  constructor(
    readonly at: ID,
    readonly page: K,
    readonly offset: number
  ) {
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
