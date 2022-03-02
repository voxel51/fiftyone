import { Auth0Provider, useAuth0 } from "@auth0/auth0-react";
import {
  Loading,
  RelayEnvironment,
  withErrorBoundary,
  withTheme,
} from "@fiftyone/components";
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

const query = loadQuery<srcQuery>(RelayEnvironment, configQuery, {});

const Config = () => {
  const { teamsConfig: config } = usePreloadedQuery<srcQuery>(
    graphql`
      query srcQuery {
        teamsConfig {
          auth0Audience
          auth0ClientId
          auth0Domain
          auth0Organization
        }
      }
    `,
    query
  );

  return (
    <Auth0Provider
      audience={config.auth0Audience}
      clientId={config.auth0ClientId}
      domain={config.auth0Domain}
      organization={config.auth0Organization}
      onRedirectCallback={(state) => {}}
    >
      <Authenticate />
    </Auth0Provider>
  );
};

const App = withErrorBoundary(
  withTheme(() => {
    return (
      <RelayEnvironmentProvider environment={RelayEnvironment}>
        <Suspense fallback={<Loading>Pixelating...</Loading>}>
          <Config />
        </Suspense>
      </RelayEnvironmentProvider>
    );
  }, atom({ key: "theme", default: darkTheme }))
);

document.addEventListener("DOMContentLoaded", () =>
  ReactDOM.render(
    <RecoilRoot>
      <App />
    </RecoilRoot>,
    document.getElementById("root")
  )
);
