import { atomWithStorage } from "jotai/utils";

export const ANNOTATE = "annotate";
export const EXPLORE = "explore";

/**
 * Creates a storage implementation that prepends the dataset name to the storage key.
 * This allows different datasets to have their own separate storage values.
 *
 * @param getDatasetName - Function that returns the current dataset name
 * @returns A custom storage implementation
 */
const createDatasetKeyedStorage = <T>(
  getDatasetName: () => string | null | undefined
) => {
  return {
    getItem: (key: string, initialValue: T): T => {
      const datasetName = getDatasetName();
      const prefixedKey = datasetName ? `${datasetName}_${key}` : key;
      const storedValue = localStorage.getItem(prefixedKey);

      if (storedValue === null) {
        return initialValue;
      }

      try {
        return JSON.parse(storedValue) as T;
      } catch {
        return initialValue;
      }
    },

    setItem: (key: string, value: T): void => {
      const datasetName = getDatasetName();
      const prefixedKey = datasetName ? `${datasetName}_${key}` : key;
      localStorage.setItem(prefixedKey, JSON.stringify(value));
    },

    removeItem: (key: string): void => {
      const datasetName = getDatasetName();
      const prefixedKey = datasetName ? `${datasetName}_${key}` : key;
      localStorage.removeItem(prefixedKey);
    },

    subscribe: (
      key: string,
      callback: (value: T) => void,
      initialValue: T
    ): (() => void) | undefined => {
      if (
        typeof window === "undefined" ||
        typeof window.addEventListener === "undefined"
      ) {
        return undefined;
      }

      const handler = (e: StorageEvent) => {
        const datasetName = getDatasetName();
        const prefixedKey = datasetName ? `${datasetName}_${key}` : key;

        if (e.storageArea === localStorage && e.key === prefixedKey) {
          let newValue: T;
          try {
            newValue = e.newValue ? JSON.parse(e.newValue) : initialValue;
          } catch {
            newValue = initialValue;
          }
          callback(newValue);
        }
      };

      window.addEventListener("storage", handler);
      return () => window.removeEventListener("storage", handler);
    },
  };
};

/**
 * Returns the current dataset name from the URL
 *
 * @returns The current dataset name
 */
const getDatasetName = (): string => {
  if (typeof window === "undefined") {
    return "";
  }

  try {
    const url = new URL(window.location.href);
    const match = url.pathname.match(/\/datasets\/([^/?]+)/);
    return match ? decodeURIComponent(match[1]) : "";
  } catch {
    return "";
  }
};

export const modalMode = atomWithStorage<"explore" | "annotate">(
  "modalMode",
  "explore",
  createDatasetKeyedStorage<"explore" | "annotate">(getDatasetName)
);
