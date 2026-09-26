/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { type Atom, type Getter, atom as primitive, type Setter } from "jotai";
import { withAtomEffect } from "jotai-effect";
import type { DefaultValue } from "./sentinel";
import { snapshotFrom } from "./snapshot";
import type { ReverbState, SnapshotInterface, Write } from "./types";

/**
 * `getPromise` and `getLoadable` read without subscribing, so reading a sibling
 * does not re-run the effect.
 */
export interface AtomEffectParams<T> extends SnapshotInterface {
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

/**
 * A read with no dependencies evaluates once per store, so each store holds its
 * own host and one server render's listeners never see another's writes.
 */
export function effectHost<T>(key: string): Atom<EffectHost<T>> {
  const host = primitive(() => new EffectHost<T>());
  host.debugLabel = `${key}/effects`;

  return host;
}

/**
 * Runs every effect once per store the atom becomes active in. `jotai-effect`
 * binds `get` and `set` to that store, which is what keeps the accessors handed
 * to an effect — including ones it captures and calls later — store-scoped.
 */
export function withEffects<T>(
  state: ReverbState<T>,
  host: Atom<EffectHost<T>>,
  effects: readonly AtomEffect<T>[],
  writeSelf: (read: Getter, write: Setter, next: Write<T>) => void,
): ReverbState<T> {
  const node: ReverbState<T> = withAtomEffect(state, (get, set) => {
    const removers: Array<() => void> = [];
    const teardowns = effects.map((effect) =>
      effect({
        ...snapshotFrom(get.peek),
        node,
        trigger: "get",
        setSelf: (next) => writeSelf(get.peek, set, next),
        onSet: (listener) => void removers.push(get.peek(host).add(listener)),
      }),
    );

    return () => {
      for (const teardown of teardowns) {
        if (typeof teardown === "function") {
          teardown();
        }
      }

      for (const remove of removers) {
        remove();
      }
    };
  });

  return node;
}
