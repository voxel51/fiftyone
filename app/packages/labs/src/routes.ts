import { loadQuery } from "react-relay";
import { RouteConfig } from "react-router-config";

import ModuleResource from "./ModuleResource";
import RelayEnvironment from "./RelayEnvironment";

const routes: RouteConfig[] = [
  {
    component: ModuleResource("Root", () => import("./Root")),
    prepare: async (params) => {
      const RootQuery = ModuleResource(
        "Root.Query",
        () => import("./Root/Query.graphql")
      );
      return {
        rootQuery: loadQuery(
          RelayEnvironment,
          RootQuery.get(),
          {},
          { fetchPolicy: "store-or-network" }
        ),
      };
    },
    routes: [
      {
        path: "/",
        exact: true,
        component: ModuleResource("Home", () => import("./Root/Home")),
        prepare: async (params) => {
          const HomeQuery = ModuleResource(
            "Home.Query",
            () => import("./Root/Home/Query.graphql")
          );
          return {
            issuesQuery: loadQuery(
              RelayEnvironment,
              HomeQuery.get(),
              {},
              { fetchPolicy: "store-or-network" }
            ),
          };
        },
      },
    ],
  },
];

export default routes;
