import { PluginComponentType, useActivePlugins } from "@fiftyone/plugins";
import { useUnboundState } from "@fiftyone/state";
import { isNullish } from "@fiftyone/utilities";
import { get, isEqual, set } from "lodash";
import React, { useEffect, useMemo } from "react";
import { isPathUserChanged } from "../hooks";
import {
  getComponent,
  getErrorsForView,
  isCompositeView,
  isInitialized,
} from "../utils";
import { AncestorsType, SchemaType, ViewPropsType } from "../utils/types";
import ContainerizedComponent from "./ContainerizedComponent";

export default function DynamicIO(props: ViewPropsType) {
  const { schema, onChange } = props;
  const customComponents = useCustomComponents();
  const Component = getComponent(schema, customComponents);
  const computedSchema = getComputedSchema(props);

  useStateInitializer(props);

  const onChangeWithSchema = useMemo(() => {
    return (
      path: string,
      value: unknown,
      schema?: SchemaType,
      ancestors: AncestorsType = {}
    ) => {
      const isComposite = isCompositeView(computedSchema);
      const subSchema = !isComposite ? computedSchema : undefined;
      const currentPath = props.path;
      const computedAncestors = { ...ancestors };
      if (isComposite) {
        computedAncestors[currentPath] = computedSchema;
      }
      onChange(
        path,
        value,
        schema ?? subSchema ?? computedSchema,
        computedAncestors
      );
    };
  }, [onChange, computedSchema, props.path]);

  return (
    <ContainerizedComponent {...props} schema={computedSchema}>
      <Component
        {...props}
        onChange={onChangeWithSchema}
        schema={computedSchema}
        validationErrors={getErrorsForView(props)}
      />
    </ContainerizedComponent>
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

// todo: need to improve initializing the state... refactor this function
function useStateInitializer(props: ViewPropsType) {
  const { data, onChange } = props;
  const computedSchema = getComputedSchema(props);
  const { default: defaultValue } = computedSchema;
  const shouldInitialize = useMemo(() => {
    return !isCompositeView(computedSchema);
  }, [computedSchema]);
  const basicData = useMemo(() => {
    if (shouldInitialize) {
      return data;
    }
  }, [shouldInitialize, data]);
  const unboundState = useUnboundState({
    computedSchema,
    props,
    data,
    shouldInitialize,
    onChange,
  });

  useEffect(() => {
    const { computedSchema, props, shouldInitialize, onChange } = unboundState;
    const { data, path, root_id, otherProps = {} } = props || {};
    const { updatableDefaultValue = true } = otherProps;
    const updateToDefault = updatableDefaultValue ? true : isNullish(data);
    if (
      shouldInitialize &&
      updateToDefault &&
      !isNullish(defaultValue) &&
      !isPathUserChanged(path, root_id) &&
      !isInitialized(props) &&
      !isEqual(data, defaultValue)
    ) {
      onChange(path, defaultValue, computedSchema);
    }
  }, [defaultValue]);

  useEffect(() => {
    if (basicData) {
      const { computedSchema, props, onChange } = unboundState;
      const { data, path } = props || {};
      if (
        !isEqual(data, basicData) &&
        !isCompositeView(computedSchema) &&
        !isNullish(path)
      ) {
        onChange(path, basicData, computedSchema);
      }
    }
  }, [basicData]);
}

function schemaWithInheritedDefault(
  schema: ViewPropsType["schema"],
  parentSchema: ViewPropsType["parentSchema"],
  path: ViewPropsType["relativePath"]
) {
  const providedDefault = get(schema, "default");
  const inheritedDefault = get(parentSchema, `default.${path}`);
  const computedDefault = providedDefault ?? inheritedDefault;
  return { ...schema, default: computedDefault };
}

function schemaWithInheritedVariant(
  schema: ViewPropsType["schema"],
  parentSchema: ViewPropsType["parentSchema"]
) {
  if (isNullish(get(schema, "view.variant"))) {
    set(schema, "view.variant", get(parentSchema, "view.variant"));
    set(schema, "view.compact", true);
  }
  if (isNullish(get(schema, "view.color"))) {
    set(schema, "view.color", get(parentSchema, "view.color"));
  }
  return schema;
}

function getComputedSchema(props: ViewPropsType) {
  const { schema, parentSchema, relativePath } = props;
  let computedSchema = schemaWithInheritedDefault(
    schema,
    parentSchema,
    relativePath
  );
  const parentView = parentSchema?.view?.name;
  if (parentView === "MenuView") {
    computedSchema = schemaWithInheritedVariant(computedSchema, parentSchema);
  }
  return computedSchema;
}
