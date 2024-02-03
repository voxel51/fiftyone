import {
  isElectron,
  isNotebook,
  NotFoundError,
  Resource,
} from "@fiftyone/utilities";
import {
  Action,
  createBrowserHistory,
  createMemoryHistory,
  Location,
} from "history";
import React from "react";
import { loadQuery, PreloadedQuery } from "react-relay";
import {
  ConcreteRequest,
  Environment,
  fetchQuery,
  OperationType,
  VariablesOf,
} from "relay-runtime";
import { Route } from ".";
import { Queries } from "../makeRoutes";
import { LocationState, matchPath, MatchPathResult } from "./matchPath";
import RouteDefinition from "./RouteDefinition";

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
  history: ReturnType<typeof createBrowserHistory>;
  get: () => Entry<T>;
  load: (hard?: boolean) => Promise<Entry<T>>;
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

    requestAnimationFrame(() =>
      subscribers.forEach(([_, onPending]) => onPending && onPending())
    );
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
            currentEntryResource = loadingResource;
            subscribers.forEach(([cb]) => cb(entry, action));
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
    get() {
      if (!currentEntryResource) {
        throw new Error("no entry loaded");
      }
      const entry = currentEntryResource.get();
      if (!entry) {
        throw new Error("entry is loading");
      }
      return entry;
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
    cleanup: () => cleanup && cleanup(),
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
  let matchResult: MatchPathResult<T>;
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
        const promise = new Promise<Entry<T>>((resolve, reject) => {
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
          error: (error) => handleError(error),
        });

        return promise;
      }
    );
  });
};

export const RouterContext = React.createContext<
  RoutingContext<Queries> | undefined
>(undefined);
