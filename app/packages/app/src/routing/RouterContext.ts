/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

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
import { splitSamplePath } from "../location/routes";

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
  previousEntry?: Entry<T>,
) => void;

type Subscribe<T extends OperationType> = (
  subscription: Subscription<T>,
  onPending?: () => void,
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
  handleError?: (error: unknown) => void,
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

  const update = (
    location: FiftyOneLocation,
    action?: Action,
    attach?: Resource<Entry<T>>,
  ) => {
    currentEntryResource.load().then(({ cleanup }) => {
      try {
        nextCurrentEntryResource =
          attach ??
          getEntryResource({
            environment,
            routes,
            location: location as FiftyOneLocation,
            hard: true,
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
            } catch {
              // the current entry may not have resolved yet
            }
            for (const [_, [cb]] of subscribers) cb(entry, action, current);
            // update currentEntryResource after calling subscribers
            currentEntryResource = loadingResource;
            cleanup();
          });
      });
    });
  };

  // the history entry on screen, routed or not
  let shown: Seen = history.location;

  const cleanup = history.listen(({ location, action }) => {
    if (!currentEntryResource) return;
    const from = shown;
    shown = location;
    if (isParamMove(location, from, action)) return;
    update(
      {
        ...location,
        state: routed((location.state ?? {}) as LocationState),
      } as FiftyOneLocation,
      action,
    );
  });

  const context: RoutingContext<T> = {
    history,

    get location() {
      const location = history.location as FiftyOneLocation;
      // Shared UI features write query parameters without a route transition.
      // Read those changes before a modal/view writer builds the next URL.
      return !isNotebook() && window.location.pathname === location.pathname
        ? {
            ...location,
            search: window.location.search,
            hash: window.location.hash,
          }
        : location;
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
      if (!currentEntryResource || hard) {
        currentEntryResource = getEntryResource({
          environment,
          hard,
          handleError,
          location: history.location as FiftyOneLocation,
          routes,
        });
        update(
          history.location as FiftyOneLocation,
          undefined,
          currentEntryResource,
        );
      }
      return currentEntryResource.load();
    },

    push(to: string, state: LocationState) {
      history.push(to, routed(state));
    },

    replace(to: string, state: LocationState) {
      history.replace(to, routed(state));
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

const SKIP_EVENTS = new Set(["spaces"]);

/**
 * Marks an entry the location store wrote. Its params moved but its route did
 * not, so the router keeps the entry; the store carries the entry's state
 * forward, since it still holds what the URL cannot, like unsaved stages.
 */
export const LOCATION_WRITE = "fiftyoneLocationWrite";

type Seen = Pick<Location, "pathname" | "state">;

// the dataset page a path shows, whatever sample is open on it
const pageOf = (pathname: string) => splitSamplePath(pathname).page;

const isMarked = (state: unknown) =>
  Boolean((state as Record<string, unknown> | null)?.[LOCATION_WRITE]);

const viewOf = (state: unknown) =>
  (state as LocationState | null)?.view ?? undefined;

/**
 * Whether moving `from` → `to` leaves the route where it is. A write is one
 * when the store made it; a pop is one when either end is the store's entry
 * and both show the same view, as Back from an open sample to its grid does.
 */
export const isParamMove = (to: Seen, from: Seen, action: Action) => {
  if (pageOf(to.pathname) !== pageOf(from.pathname)) return false;
  if (action !== "POP") return isMarked(to.state);
  return (
    (isMarked(to.state) || isMarked(from.state)) &&
    viewsAreEqual(viewOf(to.state), viewOf(from.state))
  );
};

/** A routed entry never inherits the mark from the state it was spread from. */
const routed = (state: LocationState): LocationState => {
  const { [LOCATION_WRITE]: _, ...rest } = state as LocationState &
    Record<string, unknown>;
  return rest as LocationState;
};

const makeGetEntryResource = <T extends OperationType>() => {
  let currentLocation: FiftyOneLocation;
  let currentResource: Resource<Entry<T>>;

  const isReusable = (location: FiftyOneLocation) => {
    if (pageOf(location.pathname) !== pageOf(currentLocation?.pathname ?? "")) {
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
    if (!hard && isReusable(location)) {
      // throw the current resource (page) if it can be reused
      throw currentResource;
    }

    let route: RouteDefinition<T>;
    let matchResult: MatchPathResult<T> | undefined = undefined;
    for (let index = 0; index < routes.length; index++) {
      route = routes[index];
      const match = matchPath<T>(
        pageOf(location.pathname),
        route,
        location.search,
        location.state,
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
            },
          );

          let resolveEntry: (entry: Entry<T>) => void;
          const promise = new Promise<Entry<T>>((resolve) => {
            resolveEntry = resolve;
          });
          const subscription = fetchQuery(
            environment,
            concreteRequest,
            matchResult.variables || {},
            { fetchPolicy },
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
        },
      );
    });

    return currentResource;
  };

  return getEntryResource;
};

export const RouterContext = React.createContext<
  RoutingContext<Queries> | undefined
>(undefined);
