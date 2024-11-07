import { viewsAreEqual } from "@fiftyone/state";
import { NotFoundError, Resource, isNotebook } from "@fiftyone/utilities";
import type { Action, Location } from "history";
import { createBrowserHistory, createMemoryHistory } from "history";
import React from "react";
import type { PreloadedQuery } from "react-relay";
import { loadQuery } from "react-relay";
import type {
  ConcreteRequest,
  Environment,
  OperationType,
  VariablesOf,
} from "relay-runtime";
import { fetchQuery } from "relay-runtime";
import type { Route } from ".";
import type { Queries } from "../makeRoutes";
import type RouteDefinition from "./RouteDefinition";
import type { LocationState, MatchPathResult } from "./matchPath";
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
  action?: Action,
  previousEntry?: Entry<T>
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
  replace(to: string, state: LocationState): void;
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
  const history = isNotebook() ? createMemoryHistory() : createBrowserHistory();

  const getEntryResource = makeGetEntryResource<T>();

  let currentEntryResource: Resource<Entry<T>>;
  let nextCurrentEntryResource: Resource<Entry<T>>;

  let nextId = 0;
  const subscribers = new Map<
    number,
    [Subscription<T>, (() => void) | undefined]
  >();

  const update = (location: FiftyOneLocation, action?: Action) => {
    currentEntryResource.load().then(({ cleanup }) => {
      try {
        nextCurrentEntryResource = getEntryResource({
          environment,
          routes,
          location: location as FiftyOneLocation,
          hard: false,
          handleError,
        });
      } catch (e) {
        if (e instanceof Resource) {
          // skip the page change if a resource is thrown
          return;
        }

        throw e;

      }

      requestAnimationFrame(() => {
        for (const [_, [__, onPending]] of subscribers) onPending?.();
      });

      const loadingResource = nextCurrentEntryResource;
      loadingResource.load().then((entry) => {
        nextCurrentEntryResource === loadingResource &&
          requestAnimationFrame(() => {
            let current: Entry<T> | undefined = undefined;
            try {
              current = currentEntryResource.read();
            } catch {}
            for (const [_, [cb]] of subscribers) cb(entry, action, current);
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
        currentEntryResource = getEntryResource({
          environment,
          hard,
          handleError,
          location: history.location as FiftyOneLocation,
          routes,
        });
      }
      runUpdate && update(history.location as FiftyOneLocation);
      return currentEntryResource.load();
    },

    push(to: string, state: LocationState) {
      history.push(to, state);
    },

    replace(to: string, state: LocationState) {
      history.replace(to, state);
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

const SKIP_EVENTS = new Set(["modal", "slice", "spaces"]);

const makeGetEntryResource = <T extends OperationType>() => {
  let currentLocation: FiftyOneLocation;
  let currentResource: Resource<Entry<T>>;

  const isReusable = (location: FiftyOneLocation) => {
    if (location.pathname !== currentLocation?.pathname) {
      return false;
    }

    if (!viewsAreEqual(location.state.view, currentLocation?.state.view)) {
      return false;
    }

    if (currentLocation) {
      return (
        SKIP_EVENTS.has(location.state.event || "") ||
        SKIP_EVENTS.has(currentLocation?.state.event || "")
      );
    }

    return false;
  };

  const getEntryResource = ({
    environment,
    handleError,
    hard = false,
    location,
    routes,
  }: {
    current?: FiftyOneLocation;
    environment: Environment;
    routes: RouteDefinition<T>[];
    location: FiftyOneLocation;
    hard: boolean;
    handleError?: (error: unknown) => void;
  }): Resource<Entry<T>> => {
    if (isReusable(location)) {
      // throw the current resource (page) if it can be reused
      throw currentResource;
    }

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

    currentLocation = location;
    currentResource = new Resource(() => {
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

    return currentResource;
  };

  return getEntryResource;
};

export const RouterContext = React.createContext<
  RoutingContext<Queries> | undefined
>(undefined);
