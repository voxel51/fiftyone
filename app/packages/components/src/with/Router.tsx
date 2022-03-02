import React from "react";
import { getFetchFunction } from "@fiftyone/utilities";
import {
  Environment,
  FetchFunction,
  GraphQLResponse,
  Network,
  RecordSource,
  Store,
} from "relay-runtime";
import { RouteDefinition, Router, createRouter } from "../routing";

async function fetchGraphQL(
  text: string | null | undefined,
  variables: object
): Promise<GraphQLResponse> {
  try {
    return await getFetchFunction()("POST", "/graphql", {
      query: text,
      variables,
    });
  } catch (error) {
    throw new Error("Failed request");
  }
}

const fetchRelay: FetchFunction = async (params, variables) => {
  return fetchGraphQL(params.text, variables);
};

export const RelayEnvironment = new Environment({
  network: Network.create(fetchRelay),
  store: new Store(new RecordSource()),
});

let router: Router<any>;

export const getRoutingContext = () => {
  return router.context;
};

const withRouter = <P extends {}>(
  Component: React.FC<P>,
  routes: RouteDefinition[]
) => {
  return (props: P) => {
    if (!router) {
      router = createRouter(routes);
    }

    return <Component {...props} />;
  };
};

export default withRouter;
