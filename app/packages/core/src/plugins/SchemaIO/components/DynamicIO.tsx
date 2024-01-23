import { PluginComponentType, useActivePlugins } from "@fiftyone/plugins";
import { isNullish } from "@fiftyone/utilities";
import { get, isEqual } from "lodash";
import React, { useEffect } from "react";
import { isPathUserChanged } from "../hooks";
import { getComponent, getErrorsForView, isCompositeView } from "../utils";

export default function DynamicIO(props) {
  const { data, schema, onChange, path, parentSchema, relativePath } = props;
  const customComponents = useCustomComponents();
  const Component = getComponent(schema, customComponents);
  const computedSchema = schemaWithInheritedDefault(
    schema,
    parentSchema,
    relativePath
  );
  const { default: defaultValue, type } = computedSchema;

  // todo: need to improve initializing default value in state
  useEffect(() => {
    if (
      !isCompositeView(schema) &&
      !isEqual(data, defaultValue) &&
      !isPathUserChanged(path) &&
      !isNullish(defaultValue)
    ) {
      onChange(path, defaultValue);
    }
  }, [defaultValue]);

  return (
    <Component
      {...props}
      schema={computedSchema}
      validationErrors={getErrorsForView(props)}
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

function schemaWithInheritedDefault(schema, parentSchema, path) {
  const providedDefault = get(schema, "default");
  const inheritedDefault = get(parentSchema, `default.${path}`);
  const computedDefault = providedDefault ?? inheritedDefault;
  return { ...schema, default: computedDefault };
}
