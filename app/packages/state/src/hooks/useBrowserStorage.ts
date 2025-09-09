import { useCallback, useState } from "react";

// riffed from https://usehooks.com/useLocalStorage/
export const useBrowserStorage = <T = string>(
  key: string,
  initialValue?: T | (() => T),
  useSessionStorage = false,
  parseFn?: {
    parse: (value: string) => T;
    stringify: (value: T) => string;
  }
) => {
  const storage = useSessionStorage
    ? window.sessionStorage
    : window.localStorage;

  // Pass initial state function to useState so logic is only executed once
  const [storedValue, setStoredValue] = useState<T>(() => {
    const item = storage.getItem(key);

    if (item) {
      // Workaround for existing "undefined" values in storage
      if (item === "undefined") {
        return initialValue instanceof Function ? initialValue() : initialValue;
      }

      if (parseFn) {
        return parseFn.parse(item);
      }

      return JSON.parse(item);
    }

    return initialValue instanceof Function ? initialValue() : initialValue;
  });

  // Return a wrapped version of useState's setter function that persists the new value to browser storage
  const setValue = useCallback(
    (value: T | ((v: T) => T)) => {
      let valueToStore;

      if (value instanceof Function) {
        setStoredValue((oldValue) => {
          valueToStore = value(oldValue);
          return valueToStore;
        });
      } else {
        valueToStore = value;
        setStoredValue(value);
      }

      // Handle undefined values by removing from storage
      if (valueToStore === undefined) {
        storage.removeItem(key);
      } else if (parseFn) {
        // Let the custom parser handle other values
        storage.setItem(key, parseFn.stringify(valueToStore));
      } else {
        // For JSON.stringify, handle other values
        storage.setItem(key, JSON.stringify(valueToStore));
      }
    },
    [key, storage, parseFn]
  );

  return [storedValue, setValue] as const;
};
