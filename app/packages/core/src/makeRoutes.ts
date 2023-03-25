import { makeRouteDefinitions, RouteDefinition } from "@fiftyone/state";
import { Environment } from "react-relay";

const makeRoutes = (environment: Environment): RouteDefinition<any>[] => {
  return makeRouteDefinitions(environment, [
    {
      path: "",
      component: {
        name: "./Root",
        loader: () => import("./Root").then((result) => result.default),
      },
      query: {
        name: "./Root/__generated__/RootQuery.graphql",
        loader: () =>
          import("./Root/__generated__/RootQuery.graphql").then(
            (query) => query.default
          ),
      },
      children: [
        {
          path: "/",
          component: {
            name: "./Root/Home",
            loader: () =>
              import("./Root/Home").then((result) => result.default),
          },
          query: undefined,
          exact: true,
        },
        {
          path: "/datasets/:name/samples",
          queryParams: { view: "savedViewSlug" },
          component: {
            name: "./Root/Datasets",
            loader: () =>
              import("./Root/Datasets").then((result) => result.default),
          },
          query: {
            name: "./__generated__/DatasetQuery.graphql",
            loader: () =>
              import("./__generated__/DatasetQuery.graphql").then(
                (query) => query.default
              ),
          },
          exact: true,
        },
        {
          path: "/datasets/:name",
          queryParams: { view: "savedViewSlug" },
          component: {
            name: "./Root/Datasets",
            loader: () =>
              import("./Root/Datasets").then((result) => result.default),
          },
          query: {
            name: "./__generated__/DatasetQuery.graphql",
            loader: () =>
              import("./__generated__/DatasetQuery.graphql").then(
                (query) => query.default
              ),
          },
          exact: true,
        },
      ],
    },
  ]);
};

export default makeRoutes;
