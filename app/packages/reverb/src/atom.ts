/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { type Atom, type Getter, atom as primitive } from "jotai";
import { resolve } from "./accessors";
import { effectHost, withEffects } from "./effects";
import { named } from "./named";
import { DefaultValue } from "./sentinel";
import type { AtomOptions, ReverbState, Write } from "./types";

/**
 * Writable state holding a value. A reset restores `default`, which is what
 * makes the sentinel mean "reset" for plain state and nothing else.
 */
const UNSET = Symbol("unset");

const isState = (value: unknown): value is Atom<unknown> =>
  typeof value === "object" && value !== null && "read" in value;

export function atom<T>(options: AtomOptions<T>): ReverbState<T> {
  /**
   * A default may be another piece of state, which is only readable inside a
   * derived read — so hold the written value separately and fall back to it.
   */
  const deferred = isState(options.default);
  const base = primitive<T | typeof UNSET>(deferred ? UNSET : options.default);
  base.debugLabel = `${options.key}/base`;

  const fallback = (get: Getter): T =>
    deferred
      ? (get(options.default as Atom<unknown>) as T)
      : (options.default as T);

  const current = (get: Getter): T => {
    const held = get(base);

    return held === UNSET ? fallback(get) : held;
  };

  const host = effectHost<T>(options.key);

  const state = named(
    primitive(
      (get) => current(get),
      (get, set, next: Write<T>) => {
        const previous = current(get);
        const requested = resolve(next, () => previous);
        const isReset = requested instanceof DefaultValue;
        const value = isReset ? fallback(get) : (requested as T);

        set(base, value);
        get(host).notify(value, isReset ? requested : previous, isReset);
      },
    ),
    options.key,
  );

  const effects = options.effects;
  if (!effects?.length) {
    return state;
  }

  /** Writing `base` rather than the state is what keeps `onSet` silent. */
  return named(
    withEffects<T>(state, host, effects, (read, write, next) => {
      const requested = resolve(next, () => current(read));

      write(base, requested instanceof DefaultValue ? UNSET : (requested as T));
    }),
    options.key,
  );
}
