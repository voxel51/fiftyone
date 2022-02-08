import { loadQuery, PreloadedQuery } from "react-relay";

import { createResourceGroup } from "./Resource";
import RelayEnvironment from "../RelayEnvironment";
import Route from "./Route";
import { OperationType } from "relay-runtime";
import { RouteComponent } from "./RouteComponent";

const queries = createResourceGroup<PreloadedQuery<OperationType>>();
const components = createResourceGroup<RouteComponent>();

const routes: Route[] = [
  {
    component: components("Root", () =>
      import("../Root").then((result) => result.default)
    ),
    prepare: (params) =>
      queries("RootQuery", () =>
        import("../Root/__generated__/RootQuery.graphql").then((query) => {
          return loadQuery(
            RelayEnvironment,
            query.default,
            {},
            { fetchPolicy: "network-only" }
          );
        })
      ),
    routes: [
      {
        path: "/",
        exact: true,
        component: components("Datasets", () =>
          import("../Root/Datasets").then((result) => result.default)
        ),
        prepare: (params) =>
          queries("HomeQuery", () =>
            import("../Root/Datasets/__generated__/DatasetsQuery.graphql").then(
              (query) => {
                return loadQuery(
                  RelayEnvironment,
                  query.default,
                  {},
                  { fetchPolicy: "network-only" }
                );
              }
            )
          ),
      },
      {
        path: "/datasets/:name",
        component: components("Dataset", () =>
          import("../Root/Datasets/Dataset").then((result) => result.default)
        ),
        prepare: (params) => {
          queries("DatasetQuery", () =>
            import("../Root/Datasets/__generated__/DatasetQuery.graphql").then(
              (query) => {
                return loadQuery(
                  RelayEnvironment,
                  query.default,
                  {
                    name: params.name,
                  },
                  { fetchPolicy: "network-only" }
                );
              }
            )
          );
        },
      },
    ],
  },
];

export default routes;
