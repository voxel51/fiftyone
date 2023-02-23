import { createResourceGroup } from "@fiftyone/utilities";
import { ConcreteRequest } from "relay-runtime";

import { Queries, Route, RouteDefinition, RouteOptions } from "./routing";

const components = createResourceGroup<Route<Queries>>();

const makeRouteDefinitions = (
  routes: RouteOptions<Queries>[]
): RouteDefinition<Queries>[] => {
  const queries = createResourceGroup<ConcreteRequest>();

  return routes.map(({ path, component, query, searchParams }) => ({
    path,
    component: components(path, component),
    query: queries(path, query),
    searchParams,
  }));
};

const makeRoutes = () => {
  return makeRouteDefinitions([
    {
      path: "/",
      component: () =>
        import("./pages/IndexPage").then((module) => module.default),
      query: () =>
        import("./pages/__generated__/pagesQuery.graphql").then(
          (module) => module.default
        ),
    },
    {
      path: "/datasets/:name",
      component: () =>
        import("./pages/datasets/DatasetPage").then(
          (module) => module.default as Route<Queries>
        ),
      query: () =>
        import("./pages/datasets/__generated__/datasetQuery.graphql").then(
          (module) => module.default
        ),
    },
  ]);
};

export default makeRoutes;
