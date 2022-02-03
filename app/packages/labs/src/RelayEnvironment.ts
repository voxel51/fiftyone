import { Auth0ContextInterface, User } from "@auth0/auth0-react";
import { Environment, Network, RecordSource, Store } from "relay-runtime";

let auth0Client: Auth0ContextInterface<User>;

async function fetchGraphQL(text, variables) {
  if (!auth0Client.isAuthenticated) {
    throw new Error("client is not authenticated");
  }

  const token = await auth0Client.getAccessTokenSilently();

  // Fetch data from GitHub's GraphQL API:
  const response = await fetch("http://localhost:5151", {
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

  // Get the response as JSON
  return await response.json();
}

// Relay passes a "params" object with the query name and text. So we define a helper function
// to call our fetchGraphQL utility with params.text.
async function fetchRelay(params, variables) {
  console.log(
    `fetching query ${params.name} with ${JSON.stringify(variables)}`
  );
  return fetchGraphQL(params.text, variables);
}

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
