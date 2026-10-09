/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { type Atom, type Getter, atom as primitive } from "jotai";
import { resolve } from "./accessors";
import { effectHost, withEffects } from "./effects";
import { isReverb, named } from "./named";
import { DefaultValue } from "./sentinel";
import type { AtomOptions, ReverbState, Write } from "./types";

/**
 * Writable state holding a value. A reset restores `default`, which is what
 * makes the sentinel mean "reset" for plain state and nothing else.
 */
const UNSET = Symbol("unset");

/** Never written: the effects' seed, if any, stands in for the default. */
const INITIAL = Symbol("initial");

const isState = (value: unknown): value is Atom<unknown> => isReverb(value);

export function atom<T>(options: AtomOptions<T>): ReverbState<T> {
  /**
   * A default may be another piece of state, which is only readable inside a
   * derived read — so hold the written value separately and fall back to it.
   */
  const deferred = isState(options.default);
  const seeds = (options.effects ?? []).flatMap(({ seed }) =>
    seed ? [seed] : [],
  );
  const base = primitive<T | typeof UNSET | typeof INITIAL>(
    seeds.length
      ? INITIAL
      : // `deferred` having been checked, the remaining branch is a plain value.
        deferred || options.resolve
        ? UNSET
        : (options.default as T),
  );
  base.debugLabel = `${options.key}/base`;

  const fallback = (get: Getter): T => {
    if (options.resolve) {
      return options.resolve();
    }

    return deferred
      ? (get(options.default as Atom<unknown>) as T)
      : (options.default as T);
  };

  /** With no dependencies, a seed is read once per store. */
  const seeded = primitive(() => {
    let value: T | typeof UNSET = UNSET;
    for (const seed of seeds) {
      const next = seed();
      if (next !== undefined) {
        value = next;
      }
    }

    return value;
  });
  seeded.debugLabel = `${options.key}/seed`;

  const current = (get: Getter): T => {
    let held = get(base);
    if (held === INITIAL) {
      held = get(seeded);
    }

    return held === UNSET ? fallback(get) : (held as T);
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

        // A reset stores UNSET rather than the resolved value: a default
        // that is itself state has to keep tracking it afterwards.
        set(base, isReset ? UNSET : value);
        get(host).notify(value, previous, isReset);
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
