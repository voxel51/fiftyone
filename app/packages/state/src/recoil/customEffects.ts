import { AtomEffect } from "recoil";
import { dataset } from "./dataset";

/**
 * Debug effect that logs when atom value is set.
 *
 * @param options - Configuration options for the logging effect
 * @param options.logPrefix - Custom prefix for log messages. Defaults to "[Recoil Set]"
 * @returns A Recoil atom effect that logs set operations
 */
export const logOnSetEffect =
  <T>(options?: { logPrefix?: string }): AtomEffect<T> =>
  ({ onSet, node }) => {
    const { logPrefix = "[Recoil Set]" } = options || {};
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
 * Recoil effect that syncs atom state with browser storage (localStorage or sessionStorage).
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
 * @returns A Recoil atom effect that syncs the atom with browser storage
 */
export const getBrowserStorageEffectForKey =
  <T>(
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
    }
  ): AtomEffect<T> =>
  ({ setSelf, onSet, getPromise }) => {
    (async () => {
      const {
        valueClass,
        sessionStorage,
        useJsonSerialization,
        prependDatasetNameInKey,
      } = props;

      const storage = sessionStorage
        ? window.sessionStorage
        : window.localStorage;

      if (prependDatasetNameInKey) {
        const datasetName = (await getPromise(dataset))?.name;
        key = `${datasetName}_${key}`;
      }

      const value = storage.getItem(key);
      let procesedValue;

      if (useJsonSerialization) {
        procesedValue = JSON.parse(value);
      } else if (valueClass === "number") {
        procesedValue = Number(value);
      } else if (valueClass === "boolean") {
        procesedValue = value === "true";
      } else if (valueClass === "stringArray") {
        if (value?.length > 0) {
          procesedValue = value?.split(",");
        } else {
          procesedValue = [];
        }
      } else {
        procesedValue = value;
      }

      if (value != null) setSelf(procesedValue);

      onSet((newValue, _oldValue, isReset) => {
        if (props.map) {
          newValue = props.map(newValue) as T;
        }
        if (isReset || newValue === undefined) {
          storage.removeItem(key);
        } else {
          storage.setItem(
            key,
            useJsonSerialization
              ? JSON.stringify(newValue)
              : (newValue as string)
          );
        }
      });
    })();
  };
