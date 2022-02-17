import { createBrowserHistory } from "history";
import { useCallback } from "react";
import { PreloadedQuery } from "react-relay";
import { matchRoutes, RouteConfig } from "react-router-config";
import { useRecoilValue, selector } from "recoil";
import { OperationType, VariablesOf } from "relay-runtime";

import Resource from "./Resource";
import Route from "./Route";
import { RouteComponent } from "./RouteComponent";

import routes from "./routes";

export interface Entry<T extends OperationType> {
  pathname: string;
  entries: {
    component: Resource<RouteComponent<T>>;
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
  route: Route<T>;
  match: { params: VariablesOf<T> };
}

interface Router<T extends OperationType> {
  cleanup: () => void;
  context: RoutingContext<T>;
}

export const createRouter = (routes: Route[], options = {}) => {
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
        ((route as unknown) as Route).component.load()
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
  routes: Route<T>[],
  pathname: string
): Match<T>[] => {
  const matchedRoutes = matchRoutes(
    (routes as unknown) as RouteConfig[],
    pathname
  );

  if (!Array.isArray(matchedRoutes) || matchedRoutes.length === 0) {
    throw new Error("No route for " + pathname);
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

export const router = selector<Router<OperationType>>({
  key: "router",
  get: () => createRouter(routes),
  dangerouslyAllowMutability: true,
});

export const routingContext = selector<RoutingContext>({
  key: "routingContext",
  get: ({ get }) => {
    return get(router).context;
  },
  dangerouslyAllowMutability: true,
});

export const to = (router: RoutingContext, path: string) => {
  router.history.push(path);
};

export const useTo = () => {
  const router = useRecoilValue(routingContext);
  return useCallback(
    (path: string) => {
      to(router, path);
    },
    [router]
  );
};
