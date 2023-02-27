import { useCallback, useState } from "react";

// riffed from https://usehooks.com/useLocalStorage/
export const useBrowserStorage = <T = string>(
  key: string,
  initialValue?: T,
  useSessionStorage = false
) => {
  const storage = useSessionStorage
    ? window.sessionStorage
    : window.localStorage;

  // Pass initial state function to useState so logic is only executed once
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      // Get from local storage by key
      const item = storage.getItem(key);
      // Parse stored json or if none return initialValue
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      // If error also return initialValue
      console.error(error);
      return initialValue;
    }
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
      storage.setItem(key, JSON.stringify(valueToStore));
    },
    [key, storage]
  );

  return [storedValue, setValue] as const;
};
