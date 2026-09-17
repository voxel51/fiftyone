/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { atom } from "./atom";
import { selector } from "./selector";
import type {
  AtomFamilyOptions,
  ReadOnlySelectorFamilyOptions,
  ReadWriteSelectorFamilyOptions,
  ReverbState,
  ReverbValueReadOnly,
} from "./types";

/**
 * Sorted so two structurally equal parameters name the same member. Sets,
 * maps and non-finite numbers are spelled out because `JSON.stringify` turns
 * every set and map into `{}` and every one of `NaN`/`Infinity` into `null`,
 * which would quietly hand unequal parameters the same member.
 */
const stableKey = (param: unknown): string =>
  JSON.stringify(param, (_key, value) => {
    if (value instanceof Set) {
      return { set: [...value].map(stableKey).sort() };
    }

    if (value instanceof Map) {
      return {
        map: [...value]
          .map(([key, held]) => `${stableKey(key)}:${stableKey(held)}`)
          .sort(),
      };
    }

    if (typeof value === "number" && !Number.isFinite(value)) {
      return `number:${value}`;
    }

    return value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(
          Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
            a < b ? -1 : 1,
          ),
        )
      : value;
  }) ?? "undefined";

export interface Family<P, S> {
  (param: P): S;
  remove(param: P): void;
  clear(): void;
}

/**
 * Members are keyed by value, not reference, so a parameter built inline at a
 * call site does not mint a new member on every render.
 */
function family<P, S>(create: (param: P, key: string) => S): Family<P, S> {
  const members = new Map<string, S>();

  const lookup = (param: P): S => {
    const key = stableKey(param);
    let member = members.get(key);

    if (member === undefined) {
      member = create(param, key);
      members.set(key, member);
    }

    return member;
  };

  return Object.assign(lookup, {
    remove: (param: P) => void members.delete(stableKey(param)),
    clear: () => members.clear(),
  });
}

export const atomFamily = <T, P>(
  options: AtomFamilyOptions<T, P>,
): Family<P, ReverbState<T>> =>
  family<P, ReverbState<T>>((param, key) =>
    atom<T>({
      key: `${options.key}(${key})`,
      default:
        typeof options.default === "function"
          ? (options.default as (param: P) => T)(param)
          : options.default,
      effects:
        typeof options.effects === "function"
          ? options.effects(param)
          : options.effects,
    }),
  );

export function selectorFamily<T, P>(
  options: ReadWriteSelectorFamilyOptions<T, P>,
): Family<P, ReverbState<T>>;
export function selectorFamily<T, P>(
  options: ReadOnlySelectorFamilyOptions<T, P>,
): Family<P, ReverbValueReadOnly<T>>;
export function selectorFamily<T, P>(
  options:
    | ReadOnlySelectorFamilyOptions<T, P>
    | ReadWriteSelectorFamilyOptions<T, P>,
) {
  return family<P, ReverbState<T> | ReverbValueReadOnly<T>>((param, key) =>
    "set" in options
      ? selector<T>({
          key: `${options.key}(${key})`,
          get: options.get(param),
          set: options.set(param),
        })
      : selector<T>({ key: `${options.key}(${key})`, get: options.get(param) }),
  );
}
