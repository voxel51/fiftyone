export function log(...args) {
  console.log(">>>", ...args);
}

export function getPath(basePath, propertyKey) {
  let computedPath = basePath;
  if (computedPath) computedPath += ".";
  computedPath += propertyKey;
  return computedPath;
}

export { operatorToIOSchema } from "./operator-schema";
