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
  return merge(getLayoutProps(props), getComponentProps(props, id, baseProps));
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

// Views that renders DynamicIO as a child component
const COMPOSITE_VIEWS = [
  "InferredView",
  "ListView",
  "ObjectView",
  "OneOfView",
  "TupleView",
];

export function isCompositeView(schema: SchemaType) {
  return COMPOSITE_VIEWS.includes(schema?.view?.component);
}
