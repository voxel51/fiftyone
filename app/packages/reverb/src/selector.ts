/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { type PrimitiveAtom, atom as primitive } from "jotai";
import { accessors, resolve } from "./accessors";
import type {
  ReadOnlySelectorOptions,
  ReadWriteSelectorOptions,
  ReverbState,
  ReverbValueReadOnly,
  Write,
} from "./types";

/** Each selector's private epoch, bumped to force a recomputation. */
const epochs = new WeakMap<object, PrimitiveAtom<number>>();

export const epochOf = (state: object) => epochs.get(state);

export function selector<T>(
  options: ReadWriteSelectorOptions<T>,
): ReverbState<T>;
export function selector<T>(
  options: ReadOnlySelectorOptions<T>,
): ReverbValueReadOnly<T>;
export function selector<T>(
  options: ReadOnlySelectorOptions<T> | ReadWriteSelectorOptions<T>,
) {
  const epoch = primitive(0);
  epoch.debugLabel = `${options.key}/epoch`;

  const read = primitive((get) => {
    get(epoch);

    return options.get({ get: (state) => get(state) });
  });
  read.debugLabel = options.key;

  epochs.set(read, epoch);

  if (!("set" in options)) {
    return read;
  }

  /**
   * The sentinel reaches `options.set` unchanged. Substituting a default here
   * would skip the write path a reset is expected to run.
   */
  const state: ReverbState<T> = primitive(
    (get) => get(read),
    (get, set, next: Write<T>) => {
      options.set(
        accessors(get, set),
        resolve(next, () => get(read)),
      );
    },
  );
  state.debugLabel = options.key;
  epochs.set(state, epoch);

  return state;
}

/** Resolves every member, so a caller may read a group in one dependency. */
export function waitForAll<T>(
  states: readonly ReverbValueReadOnly<T>[],
): ReverbValueReadOnly<T[]>;
export function waitForAll<T>(states: {
  [key: string]: ReverbValueReadOnly<T>;
}): ReverbValueReadOnly<Record<string, T>>;
export function waitForAll<T>(
  states:
    | readonly ReverbValueReadOnly<T>[]
    | Record<string, ReverbValueReadOnly<T>>,
) {
  if (Array.isArray(states)) {
    return primitive((get) => states.map((state) => get(state)));
  }

  return primitive((get) =>
    Object.fromEntries(
      Object.entries(states as Record<string, ReverbValueReadOnly<T>>).map(
        ([key, state]) => [key, get(state)],
      ),
    ),
  );
}

/** State whose value never changes. */
export const constSelector = <T>(value: T): ReverbValueReadOnly<T> =>
  primitive(() => value);
