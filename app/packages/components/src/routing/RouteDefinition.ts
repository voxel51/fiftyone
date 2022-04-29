import { createResourceGroup, Resource } from "@fiftyone/utilities";
import { Environment } from "react-relay";
import { ConcreteRequest } from "relay-runtime";
import { OperationType } from "relay-runtime";
import { Route } from "..";

export interface RouteBase<
  T extends OperationType | undefined = OperationType
> {
  path?: string;
  exact?: boolean;
  component: Resource<Route<T>>;
  children?: RouteBase<T>[];
}

export interface RouteDefinition<
  T extends OperationType | undefined = OperationType
> extends RouteBase<T> {
  query?: Resource<ConcreteRequest>;
  children?: RouteDefinition<T>[];
  component: Resource<Route<T>>;
}

const components = createResourceGroup();

export interface RouteOptions<T extends OperationType | undefined> {
  path: string;
  exact?: boolean;
  children?: RouteOptions<T>[];
  component: { name: string; loader: () => Promise<Route<T>> };
  query?: T extends undefined
    ? undefined
    : {
        name: string;
        loader: () => Promise<ConcreteRequest>;
      };
}

export const makeRouteDefinitions = <T extends OperationType | undefined>(
  environment: Environment,
  children: RouteOptions<T>[]
): RouteDefinition<T>[] => {
  const queries = createResourceGroup();

  return children.map(({ path, exact, children, component, query }) => ({
    path,
    exact,
    children: children
      ? makeRouteDefinitions(environment, children)
      : undefined,
    component: components(component.name, component.loader),
    query: query ? queries(query.name, query.loader) : undefined,
  }));
};

export default RouteDefinition;
