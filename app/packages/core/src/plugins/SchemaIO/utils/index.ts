import * as components from "../components";
import { UnsupportedView } from "../components";
import { get } from "lodash";

export function log(...args) {
  console.groupCollapsed(">>>", ...args);
  console.trace();
  console.groupEnd();
}

export function getPath(basePath, propertyKey) {
  let computedPath = basePath;
  if (computedPath) computedPath += ".";
  computedPath += propertyKey;
  return computedPath;
}

export function getComponent(schema, customComponents?: object) {
  const { component } = schema?.view || {};
  return (
    customComponents?.[component] || components[component] || UnsupportedView
  );
}

export function getComponentProps(props, id) {
  return get(props, `schema.view.componentsProps.${id}`, {});
}

// add map,tuple,oneof support
export function getEmptyValue(schema) {
  const itemsType = schema?.items?.type || "string";
  const emptyValuesByType = {
    string: "",
    number: 0,
    object: {},
    array: [],
  };
  return emptyValuesByType[itemsType];
}

export function getErrorsForView(props) {
  const { errors, path } = props;

  const errorsForView = errors?.[path];
  return Array.isArray(errorsForView) ? errorsForView : [];
}

export * from "./generate-schema";
export { default as autoFocus } from "./auto-focus";

// Views that renders DynamicIO as a child component
const COMPOSITE_VIEWS = [
  "InferredView",
  "ListView",
  "ObjectView",
  "OneOfView",
  "TupleView",
];

export function isCompositeView(schema) {
  return COMPOSITE_VIEWS.includes(schema?.view?.component);
}
