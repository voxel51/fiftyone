import React, { useEffect, useState } from "react";
import DynamicIO from "./components/DynamicIO";
import { set } from "lodash";
import { PluginComponentType, registerComponent } from "@fiftyone/plugins";

export function SchemaIOComponent(props) {
  const { schema, onChange } = props;
  const [state, setState] = useState({});

  function onIOChange(path, value) {
    setState((state) => {
      const updatedState = { ...state };
      set(updatedState, path, value);
      return updatedState;
    });
  }

  useEffect(() => {
    if (onChange) onChange(state);
  }, [state]);

  return <DynamicIO schema={schema} onChange={onIOChange} path="" />;
}

registerComponent({
  name: "SchemaIOComponent",
  label: "SchemaIOComponent",
  component: SchemaIOComponent,
  type: PluginComponentType.Component,
  activator: () => true,
});
