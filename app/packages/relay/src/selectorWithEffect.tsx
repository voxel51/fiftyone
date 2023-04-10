import React from "react";
import {
  ReadOnlySelectorOptions,
  ReadWriteSelectorOptions,
  selector,
} from "recoil";

export type Set<T> = ReadWriteSelectorOptions<T>["set"];

let effectStore_INTERNAL: Map<string, Set<unknown>>;

export function SelectorEffectContext({
  setters,
  children,
}: React.PropsWithChildren<{
  setters: Map<string, Set<unknown>>;
}>) {
  effectStore_INTERNAL = setters;

  return <>{children}</>;
}

export function selectorWithEffect<T>(
  options: ReadOnlySelectorOptions<T>,
  itemKey?: string
) {
  return selector({
    ...options,
    set: (...params) => {
      const key = itemKey || options.key;
      const set = effectStore_INTERNAL.get(key);
      if (!set) {
        throw new Error(`No setter for selector '${key}' found`);
      }

      set(...params);
    },
  });
}
