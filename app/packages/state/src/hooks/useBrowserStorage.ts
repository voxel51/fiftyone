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
    let item = storage.getItem(key);

    if (item) {
      if (parseFn) {
        return parseFn.parse(item);
      }
      // Workaround for existing "undefined" values in storage
      if (item === "undefined") {
        return;
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

      // Convert undefined to null to avoid "undefined" values in storage
      if (valueToStore === undefined) {  
        valueToStore = null;
      }

      storage.setItem(
        key,
        parseFn ? parseFn.stringify(valueToStore) : JSON.stringify(valueToStore)
      );
    },
    [key, storage, parseFn]
  );

  return [storedValue, setValue] as const;
};
