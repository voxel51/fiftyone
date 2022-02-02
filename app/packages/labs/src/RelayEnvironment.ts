import { Environment, Network, RecordSource, Store } from "relay-runtime";
import createAuth0Client, { Auth0Client } from "@auth0/auth0-spa-js";

let auth0: Auth0Client;
let authenticated = false;

async function fetchGraphQL(text, variables) {
  if (!auth0) {
    auth0 = await createAuth0Client({
      domain: "dev-uqppzklh.us.auth0.com",
      client_id: "pJWJhgTswZu2rF0OUOdEC5QZdNtqsUIE",
    });
  }

  if (!authenticated) {
    const query = window.location.search;
    if (query.includes("code=") && query.includes("state=")) {
      await auth0.handleRedirectCallback();

      window.history.replaceState({}, document.title, "/");
    }

    authenticated = await auth0.isAuthenticated();

    if (!authenticated) {
      await auth0.loginWithRedirect({
        redirect_uri: window.location.origin,
      });
    }
  }

  // Fetch data from GitHub's GraphQL API:
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `bearer ${REACT_APP_GITHUB_AUTH_TOKEN}`,
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

// Export a singleton instance of Relay Environment configured with our network function:
export default new Environment({
  network: Network.create(fetchRelay),
  store: new Store(new RecordSource()),
});
