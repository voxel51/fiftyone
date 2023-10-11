import { AtomEffect } from "recoil";
import { dataset } from "./atoms";

// recoil effect that syncs state with local storage
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
