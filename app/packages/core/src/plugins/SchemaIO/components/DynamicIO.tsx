import { PluginComponentType, useActivePlugins } from "@fiftyone/plugins";
import { isPrimitiveType } from "@fiftyone/utilities";
import { get } from "lodash";
import React, { useEffect } from "react";
import { getComponent, getErrorsForView } from "../utils";
import { isPathUserChanged } from "../hooks";

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
      isPrimitiveType(type) &&
      data !== defaultValue &&
      !isPathUserChanged(path)
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
