import React from "react";
import { createBrowserHistory } from "history";
import { Environment, loadQuery, PreloadedQuery } from "react-relay";
import { matchRoutes, RouteConfig } from "react-router-config";
import { OperationType, VariablesOf } from "relay-runtime";

import { NotFoundError, Resource } from "@fiftyone/utilities";
import { Route } from "..";
import RouteDefinition from "./RouteDefinition";
import { getEnvironment } from "../use/useRouter";

export interface RouteData<
  T extends OperationType | undefined = OperationType
> {
  isExact: boolean;
  params?: VariablesOf<T extends undefined ? never : T>;
  path: string;
  url: string;
}

export interface Entry<T extends OperationType | undefined = OperationType> {
  pathname: string;
  entries: {
    component: Resource<Route<T>>;
    prepared?: Resource<PreloadedQuery<T extends undefined ? never : T>>;
    routeData: RouteData<T>;
  }[];
}

export interface RoutingContext<
  T extends OperationType | undefined = OperationType
> {
  history: ReturnType<typeof createBrowserHistory>;
  get: () => Entry<T>;
  preload: (pathname: string) => void;
  subscribe: (cb: (entry: Entry<T>) => void) => () => void;
}

interface Match<T extends OperationType | undefined = OperationType> {
  route: RouteDefinition<T>;
  match: RouteData<T>;
}

export interface Router<T extends OperationType | undefined = OperationType> {
  cleanup: () => void;
  context: RoutingContext<T>;
}

export const createRouter = (
  environment: Environment,
  routes: RouteDefinition[],
  { errors, ...options } = {
    errors: true,
  }
): Router<any> => {
  const history = createBrowserHistory(options);

  const initialMatches = matchRoute(routes, history.location.pathname, errors);
  const initialEntries = prepareMatches(environment, initialMatches);

  let currentEntry = {
    pathname: history.location.pathname,
    entries: initialEntries,
  };

  let nextId = 0;
  const subscribers = new Map();

  const cleanup = history.listen((location) => {
    if (location.pathname === currentEntry.pathname) {
      return;
    }
    const matches = matchRoute(routes, location.pathname, errors);
    const entries = prepareMatches(environment, matches);
    const nextEntry = {
      pathname: location.pathname,
      entries,
    };
    currentEntry = nextEntry;
    subscribers.forEach((cb) => cb(nextEntry));
  });

  const context: RoutingContext = {
    history,
    get() {
      return currentEntry;
    },
    preload(pathname) {
      const matches = matchRoutes(
        (routes as unknown) as RouteConfig[],
        pathname
      );
      prepareMatches(environment, (matches as unknown) as Match[]);
    },
    subscribe(cb) {
      const id = nextId++;
      const dispose = () => {
        subscribers.delete(id);
      };
      subscribers.set(id, cb);
      return dispose;
    },
  };

  return { cleanup, context };
};

const matchRoute = <T extends OperationType | undefined = OperationType>(
  routes: RouteDefinition<T>[],
  pathname: string,
  errors: boolean
): Match<T>[] => {
  const matchedRoutes = matchRoutes(
    (routes as unknown) as RouteConfig[],
    pathname
  );

  if (errors && matchedRoutes.every(({ match }) => !match.isExact)) {
    throw new NotFoundError(pathname);
  }

  return (matchedRoutes as unknown) as Match<T>[];
};

const prepareMatches = (environment: Environment, matches: Match[]) => {
  return matches.map((match) => {
    const { route, match: matchData } = match;

    const query = route.query?.get();
    const component = route.component.get();
    if (component == null) {
      route.component.load();
    }

    if (route.query && query == null) {
      route.query.load();
    }

    let prepared;
    const routeQuery = route.query;
    if (routeQuery !== undefined) {
      prepared = new Resource(() =>
        routeQuery.load().then((q) =>
          loadQuery(environment, q, matchData.params || {}, {
            fetchPolicy: "network-only",
          })
        )
      );
      prepared.load();
    }

    return {
      component: route.component,
      prepared,
      routeData: matchData,
    };
  });
};

export const RouterContext = React.createContext(
  createRouter(getEnvironment(), [], { errors: false }).context
);
