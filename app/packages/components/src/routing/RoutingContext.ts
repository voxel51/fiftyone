import { createBrowserHistory } from "history";
import { PreloadedQuery } from "react-relay";
import { matchRoutes, RouteConfig } from "react-router-config";
import { OperationType, VariablesOf } from "relay-runtime";

import { NotFoundError, Resource } from "@fiftyone/utilities";
import { Route } from "..";
import RouteDefinition from "./RouteDefinition";

export interface Entry<T extends OperationType = OperationType> {
  pathname: string;
  entries: {
    component: Resource<Route<T>>;
    prepared: Resource<PreloadedQuery<T>>;
    routeData: { params: VariablesOf<T> };
  }[];
}

export interface RoutingContext<T extends OperationType = OperationType> {
  history: ReturnType<typeof createBrowserHistory>;
  get: () => Entry<T>;
  preloadCode: (pathname: string) => void;
  preload: (pathname: string) => void;
  subscribe: (cb: (entry: Entry<T>) => void) => () => void;
}

interface Match<T extends OperationType = OperationType> {
  route: RouteDefinition<T>;
  match: {
    isExact: boolean;
    params: VariablesOf<T>;
    path: string;
    url: string;
  };
}

export interface Router<T extends OperationType> {
  cleanup: () => void;
  context: RoutingContext<T>;
}

export const createRouter = (
  routes: RouteDefinition[],
  options = {}
): Router<any> => {
  const history = createBrowserHistory(options);

  const initialMatches = matchRoute(routes, history.location.pathname);
  const initialEntries = prepareMatches(initialMatches);

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
    const matches = matchRoute(routes, location.pathname);
    const entries = prepareMatches(matches);
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
    preloadCode(pathname) {
      const matches = matchRoutes(
        (routes as unknown) as RouteConfig[],
        pathname
      );
      matches.forEach(({ route }) =>
        ((route as unknown) as RouteDefinition).component.load()
      );
    },
    preload(pathname) {
      const matches = matchRoutes(
        (routes as unknown) as RouteConfig[],
        pathname
      );
      prepareMatches((matches as unknown) as Match[]);
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

const matchRoute = <T extends OperationType>(
  routes: RouteDefinition<T>[],
  pathname: string
): Match<T>[] => {
  const matchedRoutes = matchRoutes(
    (routes as unknown) as RouteConfig[],
    pathname
  );

  if (matchedRoutes.every(({ match }) => !match.isExact)) {
    throw new NotFoundError(pathname);
  }

  return (matchedRoutes as unknown) as Match<T>[];
};

const prepareMatches = (matches: Match[]) => {
  return matches.map((match) => {
    const { route, match: matchData } = match;
    const prepared = route.prepare(matchData.params);
    const Component = route.component.get();
    if (Component == null) {
      route.component.load();
    }

    const data = prepared.get();

    if (data == null) {
      prepared.load();
    }

    return {
      component: route.component,
      prepared: prepared,
      routeData: matchData,
    };
  });
};
