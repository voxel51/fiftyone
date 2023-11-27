import { PluginComponentType, registerComponent } from "@fiftyone/plugins";
import { cloneDeep, set } from "lodash";
import React, { useCallback, useEffect, useRef } from "react";
import DynamicIO from "./components/DynamicIO";
import { clearUseKeyStores } from "./hooks";

export function SchemaIOComponent(props) {
  const { onChange } = props;
  const stateRef = useRef({});
  const autoFocused = useRef(false);

  useEffect(() => {
    return clearUseKeyStores;
  }, []);

  const onIOChange = useCallback(
    (path, value) => {
      const currentState = stateRef.current;
      const updatedState = cloneDeep(currentState);
      set(updatedState, path, cloneDeep(value));
      stateRef.current = updatedState;
      if (onChange) onChange(updatedState);
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
