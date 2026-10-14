/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { createResourceGroup } from "@fiftyone/utilities";
import type { ConcreteRequest } from "relay-runtime";
import type { IndexPageQuery } from "./pages/__generated__/IndexPageQuery.graphql";
import type { DatasetPageQuery } from "./pages/datasets/__generated__/DatasetPageQuery.graphql";
import type {
  Route,
  RouteDefinition,
  RouteOptions,
  RoutingContext,
} from "./routing";

interface Routes {
  "/": RouteOptions<IndexPageQuery>;
  "/datasets/:name": RouteOptions<DatasetPageQuery>;
}

export type Queries = DatasetPageQuery | IndexPageQuery;
export type Router = RoutingContext<Queries>;
const components = createResourceGroup<Route<Queries>>();

const makeRouteDefinitions = (routes: Routes): RouteDefinition<Queries>[] => {
  const queries = createResourceGroup<ConcreteRequest>();

  return Object.entries(routes).map(([path, { component, query, ...rest }]) => {
    return {
      path,
      component: components(path, component),
      query: queries(path, query),
      ...rest,
    };
  });
};

const makeRoutes = () => {
  return makeRouteDefinitions({
    "/": {
      component: () =>
        import("./pages/IndexPage").then((module) => module.default),
      query: () =>
        import("./pages/__generated__/IndexPageQuery.graphql").then(
          (module) => module.default,
        ),
    },

    "/datasets/:name": {
      component: () =>
        import("./pages/datasets/DatasetPage").then((module) => module.default),
      query: () =>
        import("./pages/datasets/__generated__/DatasetPageQuery.graphql").then(
          (module) => module.default,
        ),
      searchParams: { view: "savedViewSlug" },
      transform: (state, variables) => {
        if (!variables.name) {
          throw new Error("dataset name not provided");
        }

        const view = state?.view || [];

        const extendedView = [...view];
        if (state.fieldVisibility) {
          extendedView.push(state.fieldVisibility);
        }
        if (state.schemaExclusion?.length) {
          extendedView.push({
            _cls: "fiftyone.core.stages.ExcludeFields",
            kwargs: {
              field_names: state.schemaExclusion,
              _allow_missing: true,
            },
          });
        }

        return {
          ...variables,
          extendedView,
        };
      },
    },
  });
};

export default makeRoutes;
