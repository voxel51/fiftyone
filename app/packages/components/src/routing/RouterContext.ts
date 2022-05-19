import React from "react";
import { createBrowserHistory, createMemoryHistory } from "history";
import { Environment, loadQuery, PreloadedQuery } from "react-relay";
import { OperationType, VariablesOf } from "relay-runtime";

import {
  isElectron,
  isNotebook,
  NotFoundError,
  Resource,
} from "@fiftyone/utilities";
import { Route } from "..";
import RouteDefinition, { RouteBase } from "./RouteDefinition";
import { getEnvironment } from "../use/useRouter";
import { MatchPathResult, matchPath } from "./matchPath";

export interface RouteData<
  T extends OperationType | undefined = OperationType
> {
  isExact: boolean;
  params?: VariablesOf<T extends undefined ? never : T>;
  path: string;
  url: string;
}

export interface Entry<T extends OperationType | undefined = OperationType> {
  pathname: string;
  entries: {
    component: Resource<Route<T>>;
    prepared?: Resource<PreloadedQuery<T extends undefined ? never : T>>;
    routeData: RouteData<T>;
  }[];
}

export interface RoutingContext<
  T extends OperationType | undefined = OperationType
> {
  history: ReturnType<typeof createBrowserHistory>;
  get: () => Entry<T>;
  pathname: string;
  preload: (pathname: string) => void;
  subscribe: (cb: (entry: Entry<T>) => void) => () => void;
}

interface Match<T extends OperationType | undefined = OperationType> {
  route: RouteDefinition<T>;
  match: RouteData<T>;
}

export interface Router<T extends OperationType | undefined = OperationType> {
  cleanup: () => void;
  context: RoutingContext<T>;
}

export const createRouter = (
  environment: Environment,
  routes: RouteDefinition[],
  { errors } = {
    errors: true,
  }
): Router<any> => {
  const history =
    isElectron() || isNotebook()
      ? createMemoryHistory()
      : createBrowserHistory();

  let currentEntry: Entry;

  let nextId = 0;
  const subscribers = new Map();

  const cleanup = history.listen(({ location }) => {
    if (!currentEntry || location.pathname === currentEntry.pathname) {
      return;
    }
    const matches = matchRoute(routes, location.pathname, errors);
    const entries = prepareMatches(environment, matches);
    const nextEntry: Entry<any> = {
      pathname: location.pathname,
      entries,
    };
    currentEntry = nextEntry;
    subscribers.forEach((cb) => cb(nextEntry));
  });

  const context: RoutingContext = {
    history,
    get() {
      if (!currentEntry) {
        currentEntry = {
          pathname: history.location.pathname,
          entries: prepareMatches(
            environment,
            matchRoute(routes, history.location.pathname, errors)
          ),
        };
      }
      return currentEntry;
    },
    get pathname() {
      return history.location.pathname;
    },
    preload(pathname) {
      if (currentEntry.pathname !== pathname) {
        prepareMatches(environment, matchRoutes(routes, pathname));
      }
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

export const matchRoutes = <
  T extends OperationType | undefined = OperationType
>(
  routes: RouteBase<T>[],
  pathname: string,
  branch: { route: RouteBase<T>; match: MatchPathResult<T> }[] = []
): { route: RouteBase<T>; match: MatchPathResult<T> }[] => {
  routes.some((route) => {
    const match = route.path
      ? matchPath(pathname, route)
      : branch.length
      ? branch[branch.length - 1].match
      : ({
          path: "/",
          url: "/",
          params: {},
          isExact: pathname === "/",
        } as MatchPathResult<T>);

    if (match) {
      branch.push({ route, match });

      if (route.children) {
        matchRoutes(route.children, pathname, branch);
      }
    }

    return match;
  });

  return branch;
};

const matchRoute = <T extends OperationType | undefined = OperationType>(
  routes: RouteDefinition<T>[],
  pathname: string,
  errors: boolean
): Match<T>[] => {
  const matchedRoutes = matchRoutes(routes, pathname);

  if (
    errors &&
    matchedRoutes &&
    matchedRoutes.every(({ match }) => !match.isExact)
  ) {
    throw new NotFoundError(pathname);
  }

  return matchedRoutes;
};

const prepareMatches = <T extends OperationType | undefined = OperationType>(
  environment: Environment,
  matches: Match<T>[]
) => {
  return matches
    ? matches.map((match) => {
        const { route, match: matchData } = match;

        const query = route.query?.get();
        const component = route.component.get();
        if (component == null) {
          route.component.load();
        }

        if (route.query && query == null) {
          route.query.load();
        }

        const routeQuery = route.query;
        if (routeQuery !== undefined) {
          const prepared = new Resource(() =>
            routeQuery.load().then((q) => {
              return loadQuery(
                environment,
                q,
                matchData.params
                  ? Object.keys(matchData.params).reduce(
                      (p: VariablesOf<any>, key) => {
                        p[key] = matchData.params
                          ? matchData.params[key]()
                          : null;

                        return p;
                      },
                      {}
                    )
                  : {},
                {
                  fetchPolicy: "network-only",
                }
              );
            })
          );

          prepared.load();

          return {
            component: route.component,
            prepared,
            routeData: matchData,
          };
        }

        return {
          component: route.component,
          routeData: matchData,
        };
      })
    : [];
};

export const RouterContext = React.createContext(
  createRouter(getEnvironment(), [], { errors: false }).context
);
