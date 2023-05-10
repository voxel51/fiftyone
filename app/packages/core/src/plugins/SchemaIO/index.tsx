import React, { useEffect, useRef, useState } from "react";
import DynamicIO from "./components/DynamicIO";
import { set } from "lodash";
import { PluginComponentType, registerComponent } from "@fiftyone/plugins";

export function SchemaIOComponent(props) {
  const { onChange } = props;
  const [state, setState] = useState({});
  const autoFocused = useRef(false);

  function onIOChange(path, value) {
    setState((state) => {
      const updatedState = structuredClone(state);
      set(updatedState, path, structuredClone(value));
      return updatedState;
    });
  }

  useEffect(() => {
    if (onChange) onChange(state);
  }, [state]);

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
