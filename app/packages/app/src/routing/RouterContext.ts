import { State } from "@fiftyone/state";
import {
  isElectron,
  isNotebook,
  NotFoundError,
  Resource,
} from "@fiftyone/utilities";
import { createBrowserHistory, createMemoryHistory, Location } from "history";
import React from "react";
import { loadQuery, PreloadedQuery } from "react-relay";
import {
  ConcreteRequest,
  Environment,
  fetchQuery,
  OperationType,
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

type LocationState<T extends OperationType> = {
  view?: State.Stage[];
  savedViewSlug?: string;
} & VariablesOf<T>;

interface FiftyOneLocation extends Location {
  state: LocationState<Queries>;
}

export interface Entry<T extends Queries> extends FiftyOneLocation {
  component: Route<T>;
  concreteRequest: ConcreteRequest;
  preloadedQuery: PreloadedQuery<T>;
  data: T["response"];
  cleanup: () => void;
}

export interface RoutingContext<T extends Queries> {
  history: ReturnType<typeof createBrowserHistory>;
  get: () => Entry<T>;
  load: () => Promise<Entry<T>>;
  subscribe: (
    cb: (entry: Entry<T>) => void,
    onPending?: () => void
  ) => () => void;
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

  let currentEntryResource: Resource<Entry<Queries>>;

  let nextId = 0;
  const subscribers = new Map();

  const cleanup = history.listen(({ location, ...r }) => {
    if (!currentEntryResource) return;
    subscribers.forEach(([_, onPending]) => onPending());
    currentEntryResource.load().then(({ cleanup }) => {
      currentEntryResource = getEntryResource(
        environment,
        routes,
        location as FiftyOneLocation
      );

      currentEntryResource.load().then((entry) => {
        requestAnimationFrame(() => {
          subscribers.forEach(([cb]) => cb(entry));
          cleanup();
        });
      });
    });
  });

  const context: RoutingContext<Queries> = {
    history,
    load() {
      if (!currentEntryResource) {
        currentEntryResource = getEntryResource(
          environment,
          routes,
          history.location as FiftyOneLocation
        );
      }
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
    cleanup,
    context,
  };
};

const getEntryResource = <T extends Queries>(
  environment: Environment,
  routes: RouteDefinition<T>[],
  location: FiftyOneLocation
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

  return new Resource(() => {
    return Promise.all([route.component.load(), route.query.load()]).then(
      ([component, concreteRequest]) => {
        const preloadedQuery = loadQuery(
          environment,
          concreteRequest,
          matchResult.variables || {},
          {
            fetchPolicy: "store-or-network",
          }
        );

        let resolveEntry: (entry: Entry<T>) => void;
        let rejectEntry: (reason?: any) => void;
        const promise = new Promise<Entry<T>>((resolve, reject) => {
          resolveEntry = resolve;
          rejectEntry = reject;
        });
        const subscription = fetchQuery(
          environment,
          concreteRequest,
          matchResult.variables || {},
          { fetchPolicy: "store-or-network" }
        ).subscribe({
          next: (data) =>
            resolveEntry({
              ...location,
              component,
              data,
              concreteRequest,
              preloadedQuery,
              cleanup: () => {
                subscription?.unsubscribe();
              },
            }),
          error: (error) => rejectEntry(error),
        });

        return promise;
      }
    );
  });
};

export const RouterContext = React.createContext<
  RoutingContext<Queries> | undefined
>(undefined);
