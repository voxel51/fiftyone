import * as components from "../components";
import { UnsupportedView } from "../components";

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

export function getComponent(schema) {
  const { component } = schema?.view || {};
  return components[component] || UnsupportedView;
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

export { operatorToIOSchema } from "./operator";
export * from "./generate-schema";
