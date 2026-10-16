import { atomWithStorage, createJSONStorage } from "jotai/utils";

type Preferences = Record<string, unknown>;

const asPreferences = (value: unknown): Preferences =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Preferences)
    : {};

const jsonStorage = createJSONStorage<Preferences>(() => {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
});

// Keep preferences usable in memory when browser storage is blocked or full.
const storage: typeof jsonStorage = {
  getItem: (key, initialValue) => {
    try {
      return asPreferences(jsonStorage.getItem(key, initialValue));
    } catch {
      return initialValue;
    }
  },
  setItem: (key, value) => {
    try {
      jsonStorage.setItem(key, value);
    } catch {
      // The atom has already applied the choice in memory.
    }
  },
  removeItem: (key) => {
    try {
      jsonStorage.removeItem(key);
    } catch {
      // A reset still applies in memory.
    }
  },
  subscribe: (key, callback, initialValue) =>
    jsonStorage.subscribe?.(
      key,
      (value) => callback(asPreferences(value)),
      initialValue,
    ),
};

// Preserve the existing keys and shapes: dataset ID → index, dataset name → k.
export const similaritySearchIndexes = atomWithStorage<Preferences>(
  "lastUsedBrainKeys",
  {},
  storage,
  { getOnInit: true },
);

export const similaritySearchResultCounts = atomWithStorage<Preferences>(
  "fiftyone-quick-search-matches",
  {},
  storage,
  { getOnInit: true },
);
