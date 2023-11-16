import { PluginComponentType, useActivePlugins } from "@fiftyone/plugins";
import React, { useEffect } from "react";
import { getComponent, getErrorsForView } from "../utils";
import { isNullish } from "@fiftyone/utilities";

export default function DynamicIO(props) {
  const { data, schema, onChange, path } = props;
  const customComponents = useCustomComponents();
  const Component = getComponent(schema, customComponents);

  // todo: need to improve initializing default value in state
  useEffect(() => {
    if (!isNullish(data)) return;
    if (schema.default) onChange(path, schema.default);
    else if (schema.type === "boolean") onChange(path, false);
  }, []);

  return <Component {...props} validationErrors={getErrorsForView(props)} />;
}

function useCustomComponents() {
  const pluginComponents =
    useActivePlugins(PluginComponentType.Component, {}) || [];

  return pluginComponents.reduce((componentsByName, component) => {
    componentsByName[component.name] = component.component;
    return componentsByName;
  }, {});
}
