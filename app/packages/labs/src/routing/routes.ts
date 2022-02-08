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
        component: components("Home", () =>
          import("../Root/Home").then((result) => result.default)
        ),
        prepare: (params) =>
          queries("HomeQuery", () =>
            import("../Root/Home/__generated__/HomeQuery.graphql").then(
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
    ],
  },
];

export default routes;
