import { createResourceGroup, Resource } from "@fiftyone/utilities";
import { Environment } from "react-relay";
import { ConcreteRequest } from "relay-runtime";
import { OperationType } from "relay-runtime";
import { Route } from "..";

interface RouteBase<T extends OperationType | undefined = OperationType> {
  path?: string;
  exact?: boolean;
  component: Resource<Route<T>>;
  routes?: RouteBase<T>[];
}

export interface RouteDefinition<
  T extends OperationType | undefined = OperationType
> extends RouteBase<T> {
  query?: Resource<ConcreteRequest>;
  routes?: RouteDefinition<T>[];
}

const components = createResourceGroup();

export interface RouteOptions<T extends OperationType | undefined> {
  path: string;
  exact?: boolean;
  routes?: RouteOptions<T>[];
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
  routes: RouteOptions<T>[]
): RouteDefinition<T>[] => {
  const queries = createResourceGroup();

  return routes.map(({ path, exact, routes, component, query }) => ({
    path,
    exact,
    routes: routes ? makeRouteDefinitions(environment, routes) : undefined,
    component: components(component.name, component.loader),
    query: query ? queries(query.name, query.loader) : undefined,
  }));
};

export default RouteDefinition;
