import { createBrowserHistory } from "history";
import React from "react";
import { PreloadedQuery } from "react-relay";
import { matchRoutes, RouteConfig } from "react-router-config";
import { OperationType } from "relay-runtime";
import Resource from "./Resource";

import Route from "./Route";
import { RouteComponent } from "./RouteComponent";

export interface Entry {
  pathname: string;
  entries: {
    component: Resource<RouteComponent>;
    prepared: Resource<PreloadedQuery<OperationType>>;
    routeData: { params: unknown };
  }[];
}

export interface RoutingContext {
  history: ReturnType<typeof createBrowserHistory>;
  get: () => Entry;
  preloadCode: (pathname: string) => void;
  preload: (pathname: string) => void;
  subscribe: (cb: (entry: Entry) => void) => () => void;
}

export const createRouter = (routes: Route[], options = {}) => {
  const history = createBrowserHistory(options);

  const initialMatches = matchRoute(routes, history.location.pathname);
  const initialEntries = prepareMatches(initialMatches);

  let currentEntry: Entry = {
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
      const matches = matchRoutes(routes, pathname);
      matches.forEach(({ route }) => route.component.load());
    },
    preload(pathname) {
      const matches = matchRoutes(routes, pathname);
      prepareMatches(matches);
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

const matchRoute = (
  routes: Route[],
  pathname: string
): { route: Route; match: { params?: unknown } }[] => {
  const matchedRoutes = matchRoutes(
    (routes as unknown) as RouteConfig[],
    pathname
  );

  if (!Array.isArray(matchedRoutes) || matchedRoutes.length === 0) {
    throw new Error("No route for " + pathname);
  }
  return (matchedRoutes as unknown) as {
    route: Route;
    match: { params?: unknown };
  }[];
};

const prepareMatches = (
  matches: { route: Route; match: { params?: unknown } }[]
) => {
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

export default React.createContext<RoutingContext | null>(null);
