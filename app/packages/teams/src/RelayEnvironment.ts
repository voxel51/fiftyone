import { Auth0ContextInterface, User } from "@auth0/auth0-react";
import { lookerError } from "@fiftyone/looker/src/elements/common/canvas.module.css";
import {
  Environment,
  FetchFunction,
  Network,
  RecordSource,
  Store,
} from "relay-runtime";

var auth0Client: Auth0ContextInterface<User>;

async function fetchGraphQL(
  text: string | null | undefined,
  variables: object
) {
  if (!auth0Client.isAuthenticated) {
    throw new Error("client is not authenticated");
  }

  const token = await auth0Client.getAccessTokenSilently();

  try {
    const response = await fetch("http://localhost:5151/graphql", {
      method: "POST",
      headers: {
        Authorization: `bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: text,
        variables,
      }),
    });

    return await response.json();
  } catch (error) {
    throw new Error("Failed request");
  }
}

const fetchRelay: FetchFunction = async (params, variables) => {
  return fetchGraphQL(params.text, variables);
};

const environment = new Environment({
  network: Network.create(fetchRelay),
  store: new Store(new RecordSource()),
});

export const getRelayEnvironment = (
  auth0: Auth0ContextInterface<User>
): Environment => {
  auth0Client = auth0;

  return environment;
};

export default environment;
