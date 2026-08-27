import { useCallback, useState } from "react";

// Browser storage can be entirely unavailable: Firefox surfaces profile-level
// storage failures as NS_ERROR_FAILURE thrown from the `window.localStorage`
// accessor itself or from any read/write, and blocked site data raises
// SecurityError. This hook backs cosmetic preferences, so storage failures
// degrade to plain in-memory state instead of throwing mid-render.
const resolveStorage = (useSessionStorage: boolean): Storage | null => {
  try {
    return useSessionStorage ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
};

// riffed from https://usehooks.com/useLocalStorage/
export const useBrowserStorage = <T = string>(
  key: string,
  initialValue?: T | (() => T),
  useSessionStorage = false,
  parseFn?: {
    parse: (value: string) => T;
    stringify: (value: T) => string;
  },
) => {
  const storage = resolveStorage(useSessionStorage);

  // Pass initial state function to useState so logic is only executed once
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = storage?.getItem(key);

      // "undefined" guards existing values written by an older stringify bug
      if (item && item !== "undefined") {
        return parseFn ? parseFn.parse(item) : JSON.parse(item);
      }
    } catch {
      // Unreadable or corrupt storage — fall through to the initial value.
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

      try {
        // Handle undefined values by removing from storage
        if (valueToStore === undefined) {
          storage?.removeItem(key);
        } else if (parseFn) {
          // Let the custom parser handle other values
          storage?.setItem(key, parseFn.stringify(valueToStore));
        } else {
          // For JSON.stringify, handle other values
          storage?.setItem(key, JSON.stringify(valueToStore));
        }
      } catch {
        // Write failed — the in-memory state above is already updated.
      }
    },
    [key, storage, parseFn],
  );

  return [storedValue, setValue] as const;
};
