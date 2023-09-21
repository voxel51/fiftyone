import { PluginComponentType, registerComponent } from "@fiftyone/plugins";
import { set } from "lodash";
import React, { useCallback, useEffect, useRef, useState } from "react";
import DynamicIO from "./components/DynamicIO";
import { clearUseKeyStores } from "./hooks";

export function SchemaIOComponent(props) {
  const { onChange } = props;
  const [state, setState] = useState({});
  const autoFocused = useRef(false);

  useEffect(() => {
    clearUseKeyStores();
  }, []);

  useEffect(() => {
    if (onChange) onChange(state);
  }, [onChange, state]);

  const onIOChange = useCallback(
    (path, value) => {
      setState((state) => {
        const updatedState = structuredClone(state);
        set(updatedState, path, structuredClone(value));
        return updatedState;
      });
    },
    [setState]
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
