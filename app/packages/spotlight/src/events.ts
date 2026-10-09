/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { ID } from "./types";

export class Load<K> {
  readonly type = "load";

  constructor(readonly page: K) {}
}

export class Rejected {
  readonly type = "rejected";

  constructor(readonly recommendedRowAspectRatioThreshold: number) {}
}

export class RowChange<K> {
  readonly type = "rowchange";

  constructor(
    readonly at: ID,
    readonly page: K,
    readonly offset: number,
  ) {}
}

/** What a {@link Spotlight} sends its listeners, by event name */
export type SpotlightEvents<K> = {
  load: Load<K>;
  rejected: Rejected;
  rowchange: RowChange<K>;
};

type EventListener<E> = (evt: E) => void;

interface EventListenerObject<E> {
  handleEvent(object: E): void;
}

export type EventCallback<E> = EventListener<E> | EventListenerObject<E>;
