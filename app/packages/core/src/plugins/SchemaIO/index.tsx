import { PluginComponentType, registerComponent } from "@fiftyone/plugins";
import { cloneDeep, get, set } from "lodash";
import React, { useCallback, useEffect, useRef } from "react";
import DynamicIO from "./components/DynamicIO";
import { clearUseKeyStores } from "./hooks";

export function SchemaIOComponent(props) {
  const { onChange, onPathChange } = props;
  const stateRef = useRef({});
  const autoFocused = useRef(false);

  useEffect(() => {
    return clearUseKeyStores;
  }, []);

  const onIOChange = useCallback(
    (path, value, schema, ancestors) => {
      if (onPathChange) {
        onPathChange(path, value, schema);
      }
      const currentState = stateRef.current;
      const updatedState = cloneDeep(currentState);
      set(updatedState, path, cloneDeep(value));
      stateRef.current = updatedState;
      if (onChange) onChange(updatedState);

      // propagate the change to all ancestors
      for (const ancestorPath in ancestors) {
        const ancestorSchema = ancestors[ancestorPath];
        const ancestorValue = get(updatedState, ancestorPath);
        if (onPathChange) {
          onPathChange(ancestorPath, ancestorValue, ancestorSchema);
        }
      }

      return updatedState;
    },
    [onChange]
  );

  return (
    <DynamicIO
      {...props}
      onChange={onIOChange}
      path=""
      autoFocused={autoFocused}
    />
  );
}

registerComponent({
  name: "SchemaIOComponent",
  label: "SchemaIOComponent",
  component: SchemaIOComponent,
  type: PluginComponentType.Component,
  activator: () => true,
});
