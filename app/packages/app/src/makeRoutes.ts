import { createResourceGroup } from "@fiftyone/utilities";
import { ConcreteRequest, OperationType } from "relay-runtime";

import { datasetQuery } from "@fiftyone/relay";
import { pagesQuery } from "./pages/__generated__/pagesQuery.graphql";
import { Route, RouteDefinition, RouteOptions } from "./routing";

interface Routes {
  "/": RouteOptions<pagesQuery>;
  "/datasets/:name": RouteOptions<datasetQuery>;
}

const components = createResourceGroup<Route<OperationType>>();

const makeRouteDefinitions = (
  routes: Routes
): RouteDefinition<OperationType>[] => {
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
          (module) => module.default
        ),
    },

    "/datasets/:name": {
      component: () =>
        import("./pages/datasets/DatasetPage").then((module) => module.default),
      query: () =>
        import("./pages/datasets/__generated__/DatasetPageQuery.graphql").then(
          (module) => module.default
        ),
      searchParams: { view: "savedViewSlug" },
      transform: (state, variables) => {
        if (!variables.name) {
          throw new Error("dataset name not provided");
        }

        return {
          ...variables,
          extendedView: state.view.concat(state.extendedStages || []),
        };
      },
    },
  });
};

export default makeRoutes;
