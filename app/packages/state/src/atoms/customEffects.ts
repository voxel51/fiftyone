import { AtomEffect } from "@fiftyone/reverb";
import { dataset } from "./dataset";

/**
 * Debug effect that logs when atom value is set.
 *
 * @param options - Configuration options for the logging effect
 * @param options.logPrefix - Custom prefix for log messages. Defaults to "[Reverb Set]"
 * @returns An atom effect that logs set operations
 */
export const logOnSetEffect =
  <T>(options?: { logPrefix?: string }): AtomEffect<T> =>
  ({ onSet, node }) => {
    const { logPrefix = "[Reverb Set]" } = options || {};
    const atomKey = (node?.key as string) || "atom";
    onSet((newValue, oldValue, isReset) => {
      console.log(`${logPrefix} ${atomKey}:`, {
        newValue,
        oldValue,
        isReset,
      });
    });
  };

/**
 * Atom effect that syncs atom state with browser storage (localStorage or sessionStorage).
 * Automatically loads the value from storage on initialization and saves it on every set.
 *
 * @param key - The storage key to use for persisting the value
 * @param props - Configuration options for the storage effect
 * @param props.map - Optional function to transform the value before storing it
 * @param props.sessionStorage - If true, uses sessionStorage instead of localStorage. Defaults to false
 * @param props.valueClass - The type of value being stored. Affects how the value is serialized/deserialized.
 *   Options: "string", "stringArray", "number", "boolean". Defaults to "string"
 * @param props.prependDatasetNameInKey - If true, prepends the dataset name to the storage key.
 *   This allows per-dataset storage isolation. Defaults to false
 * @param props.useJsonSerialization - If true, uses JSON.stringify/parse for serialization.
 *   Otherwise uses simple string conversion. Defaults to false
 * @returns An atom effect that syncs the atom with browser storage
 */
export const getBrowserStorageEffectForKey = <T>(
  key: string,
  props: {
    map?: (value: unknown) => unknown;
    sessionStorage?: boolean;
    valueClass?: "string" | "stringArray" | "number" | "boolean";
    prependDatasetNameInKey?: boolean;
    useJsonSerialization?: boolean;
  } = {
    sessionStorage: false,
    valueClass: "string",
    prependDatasetNameInKey: false,
    useJsonSerialization: false,
  },
): AtomEffect<T> => {
  const parse = (value: string | null) => {
    const { valueClass, useJsonSerialization } = props;
    if (useJsonSerialization) {
      return JSON.parse(value);
    }
    if (valueClass === "number") {
      const number = Number(value);
      return Number.isFinite(number) ? number : undefined;
    }
    if (valueClass === "boolean") {
      return value === "true";
    }
    if (valueClass === "stringArray") {
      return value?.length > 0 ? value.split(",") : [];
    }
    return value;
  };

  const effect: AtomEffect<T> = ({ setSelf, onSet, getPromise }) => {
    (async () => {
      const { sessionStorage, prependDatasetNameInKey } = props;

      const storage = sessionStorage
        ? window.sessionStorage
        : window.localStorage;

      if (prependDatasetNameInKey) {
        const datasetName = (await getPromise(dataset))?.name;
        key = `${datasetName}_${key}`;
      }

      const value = storage.getItem(key);
      const parsed = value == null ? undefined : parse(value);
      // Unreadable values (e.g. "NaN" under a number key) would loop through
      // consumers that write them back; drop them for the default
      if (value != null && parsed === undefined) {
        storage.removeItem(key);
      } else if (parsed !== undefined) {
        setSelf(parsed as T);
      }

      onSet((newValue, _oldValue, isReset) => {
        if (props.map) {
          newValue = props.map(newValue) as T;
        }
        // Don't persist non-finite numbers — they round-trip back as
        // NaN on the next load and drive the consumer into a state
        // where it can't recover. Treat them the same as a reset.
        const isUnpersistableNumber =
          props.valueClass === "number" &&
          typeof newValue === "number" &&
          !Number.isFinite(newValue);
        if (isReset || newValue === undefined || isUnpersistableNumber) {
          storage.removeItem(key);
        } else {
          storage.setItem(
            key,
            props.useJsonSerialization
              ? JSON.stringify(newValue)
              : (newValue as string),
          );
        }
      });
    })();
  };

  // A dataset-prefixed key is only known once the dataset loads
  if (!props.prependDatasetNameInKey) {
    effect.seed = () => {
      const storage = props.sessionStorage
        ? window.sessionStorage
        : window.localStorage;
      const value = storage.getItem(key);
      return value == null ? undefined : (parse(value) as T);
    };
  }

  return effect;
};
