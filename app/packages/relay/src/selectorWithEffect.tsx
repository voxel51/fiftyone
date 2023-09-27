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

export function selectorWithEffect<T>(
  {
    state,
    ...options
  }: ReadOnlySelectorOptions<T> & {
    set?:
      | ((newValue: Parameters<ReadWriteSelectorOptions<T>["set"]>[1]) => void)
      | boolean;
    state?: RecoilState<T>;
  },
  itemKey?: string
) {
  return selector({
    ...options,
    set: (...params) => {
      const key = itemKey || options.key;
      const set = effectStore_INTERNAL?.get(key);
      if (!isTest && !set) {
        throw new Error(`No setter for selector '${key}' found`);
      }
      options.set instanceof Function && options.set(params[1]);

      set && set(...params);
      state && params[0].set(state, params[1]);
    },
  });
}
