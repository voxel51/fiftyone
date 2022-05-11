import { Auth0Provider, useAuth0 } from "@auth0/auth0-react";
import { Loading, withErrorBoundary, withTheme } from "@fiftyone/components";
import { darkTheme, setFetchFunction } from "@fiftyone/utilities";
import React, { Suspense, useEffect } from "react";
import ReactDOM from "react-dom";
import {
  graphql,
  loadQuery,
  RelayEnvironmentProvider,
  usePreloadedQuery,
} from "react-relay";
import { atom, RecoilRoot } from "recoil";

import "./index.css";

import Login from "./Login";
import { useState } from "react";
import configQuery, { srcQuery } from "./__generated__/srcQuery.graphql";
import { getEnvironment } from "@fiftyone/components/src/use/useRouter";

const Authenticate = () => {
  const auth0 = useAuth0();
  const redirect = !auth0.isAuthenticated && !auth0.isLoading && !auth0.error;
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    redirect &&
      auth0.loginWithRedirect({
        redirectUri: window.location.origin,
        prompt: "login",
        appState: window.location.href,
      });
  }, [redirect]);

  useEffect(() => {
    auth0.isAuthenticated &&
      auth0.getAccessTokenSilently().then((token) => {
        document.cookie = `fiftyone-token=${token}`;
        setFetchFunction(import.meta.env.VITE_API || window.location.origin, {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        });
        setInitialized(true);
      });
  }, [auth0.isAuthenticated]);

  if (
    auth0.error ||
    (!auth0.isAuthenticated && !auth0.isLoading && !redirect)
  ) {
    return <Loading>Unauthorized</Loading>;
  }

  if (auth0.isLoading || !initialized) {
    return <Loading>Pixelating...</Loading>;
  }

  return <Login />;
};

const unauthenticatedEnvironment = getEnvironment();
const query = loadQuery<srcQuery>(unauthenticatedEnvironment, configQuery, {});

const Config = () => {
  const { teamsConfig: config } = usePreloadedQuery<srcQuery>(
    graphql`
      query srcQuery {
        teamsConfig {
          organization
        }
      }
    `,
    query
  );

  return (
    <Auth0Provider
      audience={import.meta.env.VITE_AUTH0_AUDIENCE}
      clientId={import.meta.env.VITE_AUTH0_CLIENT_ID}
      domain={import.meta.env.VITE_AUTH0_DOMAIN}
      organization={config.organization}
      onRedirectCallback={(state) => {}}
    >
      <Authenticate />
    </Auth0Provider>
  );
};

const App = withErrorBoundary(
  withTheme(() => {
    return (
      <RelayEnvironmentProvider environment={unauthenticatedEnvironment}>
        <Suspense fallback={<Loading>Pixelating...</Loading>}>
          <Config />
        </Suspense>
      </RelayEnvironmentProvider>
    );
  }, atom({ key: "theme", default: darkTheme }))
);

const root = document.getElementById("root") as HTMLDivElement;

ReactDOM.render(
  <RecoilRoot>
    <App />
  </RecoilRoot>,
  root
);
