import { PluginComponentType, registerComponent } from "@fiftyone/plugins";
import { cloneDeep, get, set } from "lodash";
import React, { useCallback, useEffect, useRef } from "react";
import DynamicIO from "./components/DynamicIO";
import { clearUseKeyStores, SchemaIOContext } from "./hooks";

export function SchemaIOComponent(props) {
  const { onChange, onPathChange, id, shouldClearUseKeyStores } = props;
  const stateRef = useRef({});
  const autoFocused = useRef(false);
  const schemaIOContext = { id };

  useEffect(() => {
    return () => {
      if (shouldClearUseKeyStores !== false) {
        clearUseKeyStores(id);
      }
    };
  }, []);

  const onIOChange = useCallback(
    (path, value, schema, ancestors) => {
      const computedValue = coerceValue(value, schema);
      const currentState = stateRef.current;
      const updatedState = cloneDeep(currentState);
      set(updatedState, path, cloneDeep(computedValue));
      stateRef.current = updatedState;
      if (onPathChange) {
        onPathChange(path, computedValue, schema, updatedState);
      }
      if (onChange) {
        onChange(updatedState);
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

  return (
    <SchemaIOContext.Provider value={schemaIOContext}>
      <DynamicIO
        {...props}
        root_id={id}
        onChange={onIOChange}
        path=""
        autoFocused={autoFocused}
      />
    </SchemaIOContext.Provider>
  );
}

function coerceValue(value, schema) {
  // coerce the value to None if it is an empty string or empty array
  if (schema.type === "array" && Array.isArray(value) && value.length === 0) {
    return null;
  }
  if (schema.type === "string" && value === "") {
    return null;
  }
  return value;
}

registerComponent({
  name: "SchemaIOComponent",
  label: "SchemaIOComponent",
  component: SchemaIOComponent,
  type: PluginComponentType.Component,
  activator: () => true,
});
