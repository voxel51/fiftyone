import { loadQuery } from "react-relay";

import RelayEnvironment from "../RelayEnvironment";
import Route, { makeRoute } from "./Route";

const routes: Route<any>[] = [
  makeRoute(
    "",
    () => import("../Root").then((result) => result.default),
    (params) =>
      import("../Root/__generated__/RootQuery.graphql").then((query) => {
        return loadQuery(
          RelayEnvironment,
          query.default,
          {},
          { fetchPolicy: "network-only" }
        );
      }),
    {
      routes: [
        makeRoute(
          "/",
          () => import("../Root/Home").then((result) => result.default),
          () =>
            import("../Root/Home/__generated__/HomeQuery.graphql").then(
              (query) => {
                return loadQuery(
                  RelayEnvironment,
                  query.default,
                  {},
                  { fetchPolicy: "network-only" }
                );
              }
            ),
          { exact: true }
        ),
        makeRoute(
          "/datasets/:name",
          () => import("../Root/Datasets").then((result) => result.default),
          (params) =>
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
            ),
          {}
        ),
      ],
    }
  ),
];

export default routes;
