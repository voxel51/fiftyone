import type { Action, Location } from "history";
import type { PreloadedQuery } from "react-relay";
import type {
  ConcreteRequest,
  Environment,
  OperationType,
  VariablesOf,
} from "relay-runtime";
import type { Route } from ".";
import type { Queries } from "../makeRoutes";
import type RouteDefinition from "./RouteDefinition";
import type { LocationState, MatchPathResult } from "./matchPath";

import {
  NotFoundError,
  Resource,
  isElectron,
  isNotebook,
} from "@fiftyone/utilities";
import { createBrowserHistory, createMemoryHistory } from "history";
import React from "react";
import { loadQuery } from "react-relay";
import { fetchQuery } from "relay-runtime";
import { matchPath } from "./matchPath";

export interface RouteData<T extends OperationType> {
  path: string;
  url: string;
  variables: VariablesOf<T>;
}

interface FiftyOneLocation extends Location {
  state: LocationState<OperationType>;
}

export interface Entry<T extends OperationType> extends FiftyOneLocation {
  component: Route<T>;
  concreteRequest: ConcreteRequest;
  preloadedQuery: PreloadedQuery<T>;
  data: T["response"];
  cleanup: () => void;
}

type Subscription<T extends OperationType> = (
  entry: Entry<T>,
  action?: Action
) => void;

type Subscribe<T extends OperationType> = (
  subscription: Subscription<T>,
  onPending?: () => void
) => () => void;

export interface RoutingContext<T extends OperationType> {
  get: (next?: boolean) => Entry<T>;
  history: ReturnType<typeof createBrowserHistory>;
  location: FiftyOneLocation;
  load: (hard?: boolean) => Promise<Entry<T>>;
  push(to: string, state: LocationState): void;
  subscribe: Subscribe<T>;
}

export interface Router<T extends OperationType> {
  cleanup: () => void;
  context: RoutingContext<T>;
}

export const createRouter = <T extends OperationType>(
  environment: Environment,
  routes: RouteDefinition<T>[],
  handleError?: (error: unknown) => void
): Router<T> => {
  const history =
    isElectron() || isNotebook()
      ? createMemoryHistory()
      : createBrowserHistory();

  let currentEntryResource: Resource<Entry<T>>;
  let nextCurrentEntryResource: Resource<Entry<T>>;

  let nextId = 0;
  const subscribers = new Map<
    number,
    [Subscription<T>, (() => void) | undefined]
  >();

  const update = (location: FiftyOneLocation, action?: Action) => {
    if (action === "REPLACE") {
      return;
    }

    requestAnimationFrame(() => {
      for (const [_, [__, onPending]] of subscribers) onPending?.();
    });
    currentEntryResource.load().then(({ cleanup }) => {
      nextCurrentEntryResource = getEntryResource<T>(
        environment,
        routes,
        location as FiftyOneLocation,
        false,
        handleError
      );

      const loadingResource = nextCurrentEntryResource;
      loadingResource.load().then((entry) => {
        nextCurrentEntryResource === loadingResource &&
          requestAnimationFrame(() => {
            for (const [_, [cb]] of subscribers) cb(entry, action);
            // update currentEntryResource after calling subscribers
            currentEntryResource = loadingResource;
            cleanup();
          });
      });
    });
  };

  const cleanup = history.listen(({ location, action }) => {
    if (!currentEntryResource) return;
    update(location as FiftyOneLocation, action);
  });

  const context: RoutingContext<T> = {
    history,

    get location() {
      return history.location as FiftyOneLocation;
    },

    get(next = false) {
      const resource = next ? nextCurrentEntryResource : currentEntryResource;
      if (!resource) {
        throw new Error("no entry loaded");
      }
      const entry = resource.get();
      if (!entry) {
        throw new Error("entry is loading");
      }
      return entry;
    },

    load(hard = false) {
      const runUpdate = !currentEntryResource || hard;
      if (!currentEntryResource || hard) {
        currentEntryResource = getEntryResource(
          environment,
          routes,
          history.location as FiftyOneLocation,
          hard,
          handleError
        );
      }
      runUpdate && update(history.location as FiftyOneLocation);
      return currentEntryResource.load();
    },

    push(to: string, state: LocationState) {
      history.push(to, state);
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
    cleanup: () => cleanup?.(),
    context,
  };
};

const getEntryResource = <T extends OperationType>(
  environment: Environment,
  routes: RouteDefinition<T>[],
  location: FiftyOneLocation,
  hard = false,
  handleError?: (error: unknown) => void
): Resource<Entry<T>> => {
  let route: RouteDefinition<T>;
  let matchResult: MatchPathResult<T> | undefined = undefined;
  for (let index = 0; index < routes.length; index++) {
    route = routes[index];
    const match = matchPath<T>(
      location.pathname,
      route,
      location.search,
      location.state
    );

    if (match) {
      matchResult = match;
      break;
    }
  }

  if (matchResult == null) {
    throw new NotFoundError({ path: location.pathname });
  }

  const fetchPolicy = hard ? "network-only" : "store-or-network";

  return new Resource(() => {
    return Promise.all([route.component.load(), route.query.load()]).then(
      ([component, concreteRequest]) => {
        const preloadedQuery = loadQuery(
          environment,
          concreteRequest,
          matchResult.variables || {},
          {
            fetchPolicy,
          }
        );

        let resolveEntry: (entry: Entry<T>) => void;
        const promise = new Promise<Entry<T>>((resolve) => {
          resolveEntry = resolve;
        });
        const subscription = fetchQuery(
          environment,
          concreteRequest,
          matchResult.variables || {},
          { fetchPolicy }
        ).subscribe({
          next: (data) => {
            const { state: _, ...rest } = location;
            resolveEntry({
              state: matchResult.variables as LocationState<T>,
              ...rest,
              component,
              data,
              concreteRequest,
              preloadedQuery,
              cleanup: () => {
                subscription?.unsubscribe();
              },
            });
          },
          error: (error) => handleError?.(error),
        });

        return promise;
      }
    );
  });
};

export const RouterContext = React.createContext<
  RoutingContext<Queries> | undefined
>(undefined);
