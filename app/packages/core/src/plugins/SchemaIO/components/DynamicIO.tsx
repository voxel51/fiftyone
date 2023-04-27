import React, { useEffect } from "react";
import { getComponent } from "../utils";
import { PluginComponentType, useActivePlugins } from "@fiftyone/plugins";

export default function DynamicIO(props) {
  const { schema, onChange, path, data, errors } = props;
  const customComponents = useCustomComponents();
  const Component = getComponent(schema, customComponents);

  // todo: need to improve initializing default value in state
  useEffect(() => {
    if (schema.default) onChange(path, schema.default);
  }, []);

  return (
    <Component
      schema={schema}
      onChange={onChange}
      path={path}
      data={data}
      errors={errors}
    />
  );
}

function useCustomComponents() {
  const pluginComponents =
    useActivePlugins(PluginComponentType.Component, {}) || [];

  return pluginComponents.reduce((componentsByName, component) => {
    componentsByName[component.name] = component.component;
    return componentsByName;
  }, {});
}
