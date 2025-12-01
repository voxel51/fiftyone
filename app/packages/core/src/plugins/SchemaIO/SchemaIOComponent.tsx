import { PluginComponentType, registerComponent } from "@fiftyone/plugins";
import { cloneDeep, get, set } from "lodash";
import { useCallback, useEffect, useRef, useState } from "react";
import DynamicIO from "./components/DynamicIO";
import { SchemaIOContext, clearUseKeyStores } from "./hooks";
import { coerceValue, getLiteValue } from "./utils";
import { ValidationErrorType } from "./utils/types";

export function SchemaIOComponent(props) {
  const {
    onChange,
    onPathChange,
    id,
    shouldClearUseKeyStores,
    data,
    onValidationErrors,
  } = props;
  const stateRef = useRef({});
  const autoFocused = useRef(false);
  const schemaIOContext = { id };
  const storeRef = useRef({ liteValues: {} });
  const [validationErrors, setValidationErrors] = useState({});

  useEffect(() => {
    if (data) {
      stateRef.current = { ...data };
    }
  }, [data]);

  useEffect(() => {
    return () => {
      if (shouldClearUseKeyStores !== false) {
        clearUseKeyStores(id);
      }
    };
  }, []);

  const onIOChange = useCallback(
    (path, value, schema, ancestors) => {
      const computedValue = coerceValue(path, value, schema);
      const currentState = stateRef.current;
      const updatedState = cloneDeep(currentState);
      set(updatedState, path, cloneDeep(computedValue));
      stateRef.current = updatedState;

      const liteValue = getLiteValue(value, schema);
      const store = storeRef.current;
      if (liteValue) {
        store.liteValues[path] = liteValue;
      }

      if (onPathChange) {
        onPathChange(path, computedValue, schema, updatedState, liteValue);
      }

      if (onChange) {
        onChange(updatedState, store.liteValues);
      }

      // propagate the change to all ancestors
      for (const ancestorPath in ancestors) {
        const ancestorSchema = ancestors[ancestorPath];
        const ancestorValue = get(updatedState, ancestorPath);
        if (onPathChange) {
          onPathChange(
            ancestorPath,
            ancestorValue,
            ancestorSchema,
            updatedState
          );
        }
      }

      return updatedState;
    },
    [onChange, onPathChange]
  );

  const onIOValidationErrors = useCallback(
    (basePath: string, errors: ValidationErrorType[]) => {
      const errorsWithBasePath = errors.map(({ path, ...error }) => ({
        ...error,
        path: path ? `${basePath}.${path}` : basePath,
      }));
      setValidationErrors((validationErrors) => ({
        ...validationErrors,
        [basePath]: errorsWithBasePath,
      }));
    },
    [setValidationErrors]
  );

  useEffect(() => {
    if (typeof onValidationErrors === "function") {
      onValidationErrors(Object.values(validationErrors).flat());
    }
  }, [validationErrors, onValidationErrors]);

  return (
    <SchemaIOContext.Provider value={schemaIOContext}>
      <DynamicIO
        {...props}
        data={data}
        root_id={id}
        onChange={onIOChange}
        path=""
        autoFocused={autoFocused}
        fullData={data}
        onValidationErrors={onIOValidationErrors}
      />
    </SchemaIOContext.Provider>
  );
}

registerComponent({
  name: "SchemaIOComponent",
  label: "SchemaIOComponent",
  component: SchemaIOComponent,
  type: PluginComponentType.Component,
  activator: () => true,
});
