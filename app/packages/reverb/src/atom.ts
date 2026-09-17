/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { type Atom, atom as primitive } from "jotai";
import { resolve } from "./accessors";
import { type AtomEffect, EffectHost } from "./effects";
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

  const fallback = (get: (state: Atom<unknown>) => unknown): T =>
    deferred
      ? (get(options.default as Atom<unknown>) as T)
      : (options.default as T);

  const host = new EffectHost<T>();

  const state: ReverbState<T> = primitive(
    (get) => {
      const held = get(base);

      return held === UNSET ? fallback(get) : held;
    },
    (get, set, next: Write<T>) => {
      const held = get(base);
      const previous = held === UNSET ? fallback(get) : held;
      const requested = resolve(next, () => previous);
      const isReset = requested instanceof DefaultValue;
      const value = isReset ? fallback(get) : (requested as T);

      set(base, value);
      host.notify(value, isReset ? requested : previous, isReset);
    },
  );
  state.debugLabel = options.key;

  const effects = options.effects;
  if (effects?.length) {
    base.onMount = (setBase) => {
      const teardowns = effects.map((effect: AtomEffect<T>) =>
        effect({
          node: state,
          trigger: "get",
          setSelf: (next) => {
            const requested = resolve(next, () => options.default as T);
            setBase(
              requested instanceof DefaultValue ? UNSET : (requested as T),
            );
          },
          onSet: (listener) => void host.add(listener),
        }),
      );

      return () => {
        for (const teardown of teardowns) {
          if (typeof teardown === "function") {
            teardown();
          }
        }
      };
    };
  }

  return state;
}
