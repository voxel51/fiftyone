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

export { operatorToIOSchema } from "./operator";
export * from "./generate-schema";
