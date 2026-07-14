import React from "react";
import {
  ReadOnlySelectorOptions,
  ReadWriteSelectorOptions,
  RecoilState,
  selector,
} from "recoil";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Setter = ReadWriteSelectorOptions<any>["set"];

let effectStore_INTERNAL: Map<string, Setter>;

export function SelectorEffectContext({
  setters,
  children,
}: React.PropsWithChildren<{
  setters: Map<string, Setter>;
}>) {
  effectStore_INTERNAL = setters;

  return <>{children}</>;
}

const isTest = typeof process !== "undefined" && process.env.MODE === "test";

/**
 * Wraps a Recoil selector so writes can be routed through the setter registry
 * provided by {@link SelectorEffectContext}.
 *
 * This is useful when a piece of state is primarily derived from another atom
 * or selector, but writes must still flow through an external sync layer such
 * as the Relay writer/session bridge. The returned selector:
 *
 * - reads exactly like a normal selector via `options.get`
 * - looks up a matching setter from the effect store using `itemKey` or
 *   `options.key`
 * - optionally transforms the write payload via `options.set`
 * - optionally mirrors the final value into `state` for local Recoil updates
 */
export function selectorWithEffect<T>(
  {
    state,
    ...options
  }: ReadOnlySelectorOptions<T> & {
    set?:
      | ((...params: Parameters<ReadWriteSelectorOptions<T>["set"]>) => T)
      | boolean;
    state?: RecoilState<T>;
  },
  itemKey?: string,
) {
  return selector({
    ...options,
    set: (...params) => {
      const key = itemKey || options.key;
      const set = effectStore_INTERNAL?.get(key);
      if (!isTest && !set) {
        throw new Error(`No setter for selector '${key}' found`);
      }

      if (options.set instanceof Function) {
        params[1] = options.set(...params);
      }

      set && set(...params);
      state && params[0].set(state, params[1]);
    },
  });
}
