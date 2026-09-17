/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { DefaultValue } from "./sentinel";
import type { ReverbState, Write } from "./types";

export interface AtomEffectParams<T> {
  node: ReverbState<T>;
  /** "get" when the effect runs on first subscription. */
  trigger: "get" | "set";
  setSelf: (next: Write<T>) => void;
  onSet: (listener: AtomEffectListener<T>) => void;
}

export type AtomEffectListener<T> = (
  next: T,
  previous: T | DefaultValue,
  isReset: boolean,
) => void;

export type AtomEffect<T> = (
  params: AtomEffectParams<T>,
) => void | (() => void);

/** Per-atom listener set, notified by the write path rather than by jotai. */
export class EffectHost<T> {
  private readonly listeners = new Set<AtomEffectListener<T>>();

  add(listener: AtomEffectListener<T>) {
    this.listeners.add(listener);

    return () => void this.listeners.delete(listener);
  }

  /** `setSelf` deliberately does not reach here, matching the API it replaces. */
  notify(next: T, previous: T | DefaultValue, isReset: boolean) {
    for (const listener of this.listeners) {
      listener(next, previous, isReset);
    }
  }
}
