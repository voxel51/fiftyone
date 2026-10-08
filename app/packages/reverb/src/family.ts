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
 * A canonical encoding of the parameter, tagged by type so no two unequal
 * parameters can produce the same key. `JSON.stringify` alone cannot do this:
 * it renders every set and map as `{}` and each of `NaN`/`Infinity` as `null`,
 * and any marker embedded in its output is a shape a plain object could also
 * produce.
 */
const stableKey = (param: unknown): string => {
  if (param === null) return "z";
  if (param === undefined) return "u";

  switch (typeof param) {
    case "string":
      return `s:${param}`;
    case "number":
      return Number.isFinite(param) ? `n:${param}` : `f:${param}`;
    case "boolean":
      return `b:${param}`;
    case "bigint":
      return `g:${param}`;
    default:
      break;
  }

  if (Array.isArray(param)) {
    return `a:[${param.map(stableKey).join(",")}]`;
  }

  if (param instanceof Set) {
    return `S:[${[...param].map(stableKey).sort().join(",")}]`;
  }

  if (param instanceof Map) {
    return `M:[${[...param]
      .map(([key, held]) => `${stableKey(key)}=>${stableKey(held)}`)
      .sort()
      .join(",")}]`;
  }

  if (param instanceof Date) {
    return `d:${param.getTime()}`;
  }

  if (typeof param === "object") {
    return `o:{${Object.entries(param as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([key, held]) => `${key}:${stableKey(held)}`)
      .join(",")}}`;
  }

  return `x:${String(param)}`;
};

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
