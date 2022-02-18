import { PreloadedQuery } from "react-relay";
import { OperationType, VariablesOf } from "relay-runtime";

import Resource, { createResourceGroup } from "./Resource";
import { RouteComponent } from "./RouteComponent";

export default interface Route<T extends OperationType = OperationType> {
  path?: string;
  exact?: boolean;
  component: Resource<RouteComponent<T>>;
  prepare: (params: VariablesOf<T>) => Resource<PreloadedQuery<T>>;
  routes?: Route<T>[];
}

const queries = createResourceGroup();
const components = createResourceGroup();

export interface RouteOptions<T extends OperationType> {
  exact?: boolean;
  routes?: Route<T>[];
}

export const makeRoute = <T extends OperationType>(
  path: string,
  get: () => Promise<RouteComponent<T>>,
  prepare: (params: VariablesOf<T>) => Promise<PreloadedQuery<T>>,
  options: RouteOptions<T>
): Route<T> => {
  return {
    path,
    prepare: (params: VariablesOf<T>) =>
      queries(`${path}-${JSON.stringify(params)}`, () => prepare(params)),
    component: components(path, get),
    ...options,
  };
};
