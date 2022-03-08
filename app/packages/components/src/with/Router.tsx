import React from "react";
import { getFetchFunction, setFetchFunction } from "@fiftyone/utilities";
import {
  Environment,
  FetchFunction,
  GraphQLResponse,
  Network,
  RecordSource,
  Store,
} from "relay-runtime";
import { RouteDefinition, Router, createRouter } from "../routing";
import { GraphQLError } from "@fiftyone/utilities/src/errors";

setFetchFunction(import.meta.env.VITE_API || window.location.origin);

async function fetchGraphQL(
  text: string | null | undefined,
  variables: object
): Promise<GraphQLResponse> {
  const data = await getFetchFunction()<unknown, GraphQLResponse>(
    "POST",
    "/graphql",
    {
      query: text,
      variables,
    }
  );

  if ("errors" in data && data.errors) {
    throw new GraphQLError(data.errors);
  }
  return data;
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
