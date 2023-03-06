import { ResponseFrom, State } from "@fiftyone/state";
import {
  isElectron,
  isNotebook,
  NotFoundError,
  Resource,
} from "@fiftyone/utilities";
import { createBrowserHistory, createMemoryHistory } from "history";
import React from "react";
import { loadQuery, PreloadedQuery } from "react-relay";
import {
  ConcreteRequest,
  createOperationDescriptor,
  Environment,
  getRequest,
  GraphQLTaggedNode,
  fetchQuery,
  VariablesOf,
} from "relay-runtime";

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
  savedViewSlug?: string;
}

export interface Entry<T extends Queries> {
  component: Resource<Route<T>>;
  query: Resource<ConcreteRequest>;
  pathname: string;
  prepared: Resource<PreloadedQuery<T>>;
  routeData: RouteData<T>;
  state: LocationState;
  search: string;
  cleanup: () => void;
}

export interface RoutingContext<T extends Queries> {
  history: ReturnType<typeof createBrowserHistory>;
  get: () => Entry<T>;
  load: () => Promise<Entry<T>>;
  pathname: string;
  state: LocationState;
  subscribe: (
    cb: (entry: Entry<T>) => void,
    onPending: () => void
  ) => () => void;
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
    subscribers.forEach(([_, onPending]) => onPending());
    prepareMatch(
      environment,
      matchRoute(routes, location.pathname, location.search, state)
    ).then((match) => {
      const { cleanup } = currentEntry;
      currentEntry = {
        ...match,
        pathname: location.pathname,
        search: location.search,
        state,
      };
      requestAnimationFrame(() => {
        subscribers.forEach(([cb]) => cb(currentEntry));
        cleanup();
      });
    });
  });

  const context: RoutingContext<Queries> = {
    history,
    load() {
      if (!currentEntry) {
        const state = history.location.state as LocationState;
        return prepareMatch(
          environment,
          matchRoute(
            routes,
            history.location.pathname,
            history.location.search,
            state
          )
        ).then((entry) => {
          currentEntry = {
            ...entry,
            pathname: history.location.pathname,
            search: location.search,
            state,
          };
          return currentEntry;
        });
      }
      return Promise.resolve(currentEntry);
    },
    get() {
      if (!currentEntry) {
        throw new Error("no entry loaded");
      }
      return currentEntry;
    },
    get pathname() {
      return currentEntry.pathname;
    },
    get state() {
      return currentEntry.state;
    },
    subscribe(cb, onPending) {
      const id = nextId++;
      const dispose = () => {
        subscribers.delete(id);
      };
      subscribers.set(id, [cb, onPending]);
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
  let resolveEntry;
  const prepared = new Resource(() =>
    route.query.load().then((q) => {
      const preloaded = loadQuery(environment, q, matchData.variables || {}, {
        fetchPolicy: "network-ony",
      });

      const subscription = preloaded.source?.subscribe({
        next: (data) =>
          route.component.load().then(() => {
            resolveEntry({
              component: route.component,
              prepared,
              preloaded,
              query: route.query,
              routeData: matchData,
              data,
              cleanup: () => {
                subscription?.unsubscribe();
              },
            });
          }),
      });

      return preloaded;
    })
  );

  prepared.load();

  return new Promise<{
    component: Resource<Route<T>>;
    prepared: Resource<PreloadedQuery<T, {}>>;
    query: Resource<ConcreteRequest>;
    routeData: RouteData<T>;
    cleanup: () => void;
  }>((resolve) => {
    resolveEntry = resolve;
  });
};

export const RouterContext = React.createContext<
  RoutingContext<Queries> | undefined
>(undefined);
