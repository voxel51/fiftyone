import { get, merge } from "lodash";
import * as components from "../components";
import { UnsupportedView } from "../components";
import {
  ArraySchemaType,
  CustomComponentsType,
  SchemaType,
  ViewPropsType,
} from "./types";
import { getLayoutProps } from "./layout";
import { isNullish } from "@fiftyone/utilities";
import { isPathUserChanged } from "../hooks";

export function log(...args: string[]) {
  console.groupCollapsed(">>>", ...args);
  console.trace();
  console.groupEnd();
}

export function getPath(basePath: string, propertyKey: string) {
  let computedPath = basePath;
  if (computedPath) computedPath += ".";
  computedPath += propertyKey;
  return computedPath;
}

export function getComponent(
  schema: SchemaType,
  customComponents?: CustomComponentsType
) {
  const { component } = schema?.view || {};
  return (
    customComponents?.[component] || components[component] || UnsupportedView
  );
}

export function getComponentProps<P>(
  props: ViewPropsType,
  id: string,
  baseProps?: P
) {
  return merge(
    baseProps || {},
    get(props, `schema.view.componentsProps.${id}`, {})
  );
}

export function getProps<P>(
  props: ViewPropsType,
  id: string,
  baseProps?: P
): P {
  return merge(baseProps, getLayoutProps(props), getComponentProps(props, id));
}

// add map,tuple,oneof support
export function getEmptyValue(schema: ArraySchemaType) {
  const itemsType = schema?.items?.type || "string";
  const emptyValuesByType = {
    string: "",
    number: 0,
    object: {},
    array: [],
  };
  return emptyValuesByType[
    itemsType as unknown as keyof typeof emptyValuesByType
  ];
}

export function getErrorsForView(props: ViewPropsType) {
  const { errors, path } = props;

  const errorsForView = errors?.[path];
  return Array.isArray(errorsForView) ? errorsForView : [];
}

export { default as autoFocus } from "./auto-focus";
export * from "./generate-schema";
export * from "./layout";
export * from "./style";

// Views that renders DynamicIO as a child component
const COMPOSITE_VIEWS = [
  "InferredView",
  "ListView",
  "ObjectView",
  "OneOfView",
  "TupleView",
  "GridView",
  "MenuView",
  "HStackView",
  "VStackView",
  "ButtonGroupView",
];

const NON_EDITABLE_VIEWS = [
  "AlertView",
  "ArrowNavView",
  "ButtonView",
  "ErrorView",
  "GridView",
  "HeaderView",
  "HiddenView",
  "ImageView",
  "JSONView",
  "KeyValueView",
  "LabelValueView",
  "LinkView",
  "LoadingView",
  "MarkdownView",
  "MediaPlayerView",
  "ProgressView",
  "TableView",
  "TagsView",
  "TreeSelectionView",
  "StatusButtonView",
];

export function isCompositeView(schema: SchemaType) {
  const { component, composite_view } = schema?.view || {};
  return composite_view || COMPOSITE_VIEWS.includes(component);
}

export function isInitialized(props: ViewPropsType) {
  const { initialData, path } = props || {};
  return !isNullish(get(initialData, path));
}

export function isEditableView(schema: SchemaType) {
  return !NON_EDITABLE_VIEWS.includes(schema?.view?.component);
}

function shouldCoerceValue(path: string, schema: SchemaType) {
  const { type, default: defaultValue } = schema;
  const pathIsChangesByUser = isPathUserChanged(path);

  // if the path is not changed by the user, we should not coerce the value
  if (!pathIsChangesByUser) {
    return false;
  }

  // coerce the value to None only if the default value is not an empty array
  if (
    type === "array" &&
    Array.isArray(defaultValue) &&
    defaultValue.length === 0
  ) {
    return false;
  }

  // coerce the value to None only if the default value is not an empty string
  if (type === "string" && defaultValue === "") {
    return false;
  }

  return true;
}

export function coerceValue(path, value, schema) {
  const { type } = schema;

  if (!shouldCoerceValue(path, schema)) {
    return value;
  }

  // coerce the value to None if it is an empty string or empty array
  if (type === "array" && Array.isArray(value) && value.length === 0) {
    return null;
  }
  if (type === "string" && value === "") {
    return null;
  }
  return value;
}
