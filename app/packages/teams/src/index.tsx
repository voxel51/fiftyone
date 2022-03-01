import { Auth0Provider, useAuth0 } from "@auth0/auth0-react";
import {
  Loading,
  RelayEnvironment,
  withErrorBoundary,
  withRelayEnvironment,
  withTheme,
} from "@fiftyone/components";
import { darkTheme, setFetchFunction } from "@fiftyone/utilities";
import React, { useEffect } from "react";
import ReactDOM from "react-dom";
import { atom, RecoilRoot } from "recoil";

import "./index.css";

import Login from "./Login";
import { useState } from "react";
import routes from "./routes";
import { RelayEnvironmentProvider } from "react-relay";

const App = withRelayEnvironment(() => {
  return (
    <RelayEnvironmentProvider environment={RelayEnvironment}>
      <Login />
    </RelayEnvironmentProvider>
  );
}, routes);

const Authenticate = withErrorBoundary(
  withTheme(() => {
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

    return <App />;
  }, atom({ key: "theme", default: darkTheme }))
);

document.addEventListener("DOMContentLoaded", () =>
  ReactDOM.render(
    <RecoilRoot>
      <Auth0Provider
        audience={import.meta.env.VITE_AUTH0_AUDIENCE}
        clientId={import.meta.env.VITE_AUTH0_CLIENT_ID}
        domain={import.meta.env.VITE_AUTH0_DOMAIN}
        organization={import.meta.env.VITE_AUTH0_ORGANIZATION}
        onRedirectCallback={(state) => {
          console.log(state);
          //state.returnTo && window.location.assign(state.returnTo)
        }}
      >
        <Authenticate />
      </Auth0Provider>
    </RecoilRoot>,
    document.getElementById("root")
  )
);
