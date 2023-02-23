import { State } from "@fiftyone/state";
import {
  isElectron,
  isNotebook,
  NotFoundError,
  Resource,
} from "@fiftyone/utilities";
import { createBrowserHistory, createMemoryHistory } from "history";
import React from "react";
import { loadQuery, PreloadedQuery } from "react-relay";
import { ConcreteRequest, Environment, VariablesOf } from "relay-runtime";

import { Queries, Route } from ".";
import RouteDefinition from "./RouteDefinition";
import { MatchPathResult, matchPath } from "./matchPath";

export interface RouteData<T extends Queries> {
  path: string;
  url: string;
  variables: VariablesOf<T>;
}

export interface LocationState {
  view?: State.Stage[];
}

export interface Entry<T extends Queries> {
  component: Resource<Route<T>>;
  query: Resource<ConcreteRequest>;
  pathname: string;
  prepared: Resource<PreloadedQuery<T>>;
  routeData: RouteData<T>;
  state: LocationState;
  search: string;
}

export interface RoutingContext<T extends Queries> {
  history: ReturnType<typeof createBrowserHistory>;
  get: () => Entry<T>;
  pathname: string;
  state: LocationState;
  subscribe: (cb: (entry: Entry<T>) => void) => () => void;
}

interface Match<T extends Queries> {
  route: RouteDefinition<T>;
  match: RouteData<T>;
}

export interface Router<T extends Queries> {
  cleanup: () => void;
  context: RoutingContext<T>;
}

export const createRouter = (
  environment: Environment,
  routes: RouteDefinition<Queries>[]
): Router<Queries> => {
  const history =
    isElectron() || isNotebook()
      ? createMemoryHistory()
      : createBrowserHistory();

  let currentEntry: Entry<Queries>;

  let nextId = 0;
  const subscribers = new Map();

  const cleanup = history.listen(({ location }) => {
    if (!currentEntry) return;
    const state = location.state as LocationState;
    currentEntry = {
      ...prepareMatch(
        environment,
        matchRoute(routes, location.pathname, location.search, state)
      ),
      pathname: location.pathname,
      search: location.search,
      state,
    };
    subscribers.forEach((cb) => cb(currentEntry));
  });

  const context: RoutingContext<Queries> = {
    history,
    get() {
      if (!currentEntry) {
        const state = history.location.state as LocationState;

        currentEntry = {
          ...prepareMatch(
            environment,
            matchRoute(
              routes,
              history.location.pathname,
              history.location.search,
              state
            )
          ),
          pathname: history.location.pathname,
          search: location.search,
          state,
        };
      }
      return currentEntry;
    },
    get pathname() {
      return currentEntry.pathname;
    },
    get state() {
      return currentEntry.state;
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

  return {
    cleanup,
    context,
  };
};

export const matchRoute = <T extends Queries>(
  routes: RouteDefinition<T>[],
  pathname: string,
  search: string,
  variables: Partial<VariablesOf<T>>
): { route: RouteDefinition<T>; match: MatchPathResult<T> } => {
  for (let index = 0; index < routes.length; index++) {
    const route = routes[index];
    const match = matchPath(pathname, route, search, variables);

    if (match) return { route, match };
  }

  throw new NotFoundError({ path: pathname });
};

const prepareMatch = <T extends Queries>(
  environment: Environment,
  { route, match: matchData }: Match<T>
) => {
  const component = route.component.get();
  if (component == null) {
    route.component.load();
  }

  if (route.query.get() == null) {
    route.query.load();
  }

  const prepared = new Resource(() =>
    route.query.load().then((q) => {
      const request = loadQuery(environment, q, matchData.variables || {}, {
        fetchPolicy: "network-only",
      });

      return request;
    })
  );

  prepared.load();

  return {
    component: route.component,
    prepared,
    query: route.query,
    routeData: matchData,
  };
};

export const RouterContext = React.createContext<
  RoutingContext<Queries> | undefined
>(undefined);
