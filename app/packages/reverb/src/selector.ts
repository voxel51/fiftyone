/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { type Getter, type PrimitiveAtom, atom as primitive } from "jotai";
import { accessors, resolve } from "./accessors";
import { named } from "./named";
import type {
  ReadOnlySelectorOptions,
  ReadWriteSelectorOptions,
  ReverbState,
  ReverbValue,
  ReverbValueReadOnly,
  Write,
} from "./types";

const AWAIT = Symbol("await");

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

  /**
   * A pending dependency suspends the whole read rather than handing a promise
   * to `options.get`. Each settled value is remembered so the re-run makes
   * progress instead of meeting the same promise again.
   */
  const compute = (
    get: Getter,
    settled: Map<object, unknown>,
  ): T | Promise<T> => {
    let awaiting: { state: object; promise: Promise<unknown> } | undefined;

    try {
      return options.get({
        get: <V>(state: ReverbValue<V>): V => {
          if (settled.has(state)) {
            return settled.get(state) as V;
          }

          const value = get(state);

          if (value instanceof Promise) {
            awaiting = { state, promise: value };
            throw AWAIT;
          }

          return value as V;
        },
      });
    } catch (thrown) {
      if (thrown !== AWAIT || !awaiting) {
        throw thrown;
      }

      const { state, promise } = awaiting;

      return promise.then((value) => {
        settled.set(state, value);

        return compute(get, settled);
      }) as Promise<T>;
    }
  };

  const read = named(
    primitive((get) => {
      get(epoch);

      return compute(get, new Map());
    }),
    options.key,
  );

  epochs.set(read, epoch);

  if (!("set" in options)) {
    return read;
  }

  /**
   * The sentinel reaches `options.set` unchanged. Substituting a default here
   * would skip the write path a reset is expected to run.
   */
  /**
   * A pending read is typed away here: jotai hands a consumer the settled
   * value through Suspense, so a reader never observes the promise.
   */
  const state = named(
    primitive(
      (get) => get(read) as T,
      (get, set, next: Write<T>) => {
        options.set(
          accessors(get, set),
          resolve(next, () => get(read) as T),
        );
      },
    ),
    options.key,
  );
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
  named(
    primitive(() => value),
    "constSelector",
  );
