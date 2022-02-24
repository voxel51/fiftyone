import { createResourceGroup, Resource } from "@fiftyone/utilities";
import { PreloadedQuery } from "react-relay";
import { OperationType, VariablesOf } from "relay-runtime";
import { Route } from "..";

export interface RouteDefinition<T extends OperationType = OperationType> {
  path?: string;
  exact?: boolean;
  component: Resource<Route<T>>;
  prepare: (params: VariablesOf<T>) => Resource<PreloadedQuery<T>>;
  routes?: RouteDefinition<T>[];
}

const queries = createResourceGroup();
const components = createResourceGroup();

export interface RouteOptions<T extends OperationType> {
  exact?: boolean;
  routes?: RouteDefinition<T>[];
}

export const makeRouteDefinition = <T extends OperationType>(
  path: string,
  get: () => Promise<Route<T>>,
  prepare: (params: VariablesOf<T>) => Promise<PreloadedQuery<T>>,
  options: RouteOptions<T>
): RouteDefinition<T> => {
  return {
    path,
    prepare: (params: VariablesOf<T>) =>
      queries(`${path}-${JSON.stringify(params)}`, () => prepare(params)),
    component: components(path, get),
    ...options,
  };
};

export default RouteDefinition;
