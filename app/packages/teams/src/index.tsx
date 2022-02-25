import { Auth0Provider, useAuth0 } from "@auth0/auth0-react";
import {
  Loading,
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

const App: React.FC = withRelayEnvironment(
  withErrorBoundary(
    withTheme(() => {
      return <Login />;
    }, atom({ key: "theme", default: darkTheme }))
  ),
  routes
);

const Authenticate = () => {
  const auth0 = useAuth0();
  const redirect = !auth0.isAuthenticated && !auth0.isLoading && !auth0.error;
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    redirect &&
      auth0.loginWithRedirect({
        redirectUri: `${window.location.protocol}//${window.location.host}`,
        prompt: "login",
        appState: window.location.href,
      });
  }, [redirect]);

  useEffect(() => {
    auth0.isAuthenticated &&
      auth0.getAccessTokenSilently().then((token) => {
        document.cookie = `fiftyone-token=${token}`;
        setFetchFunction("https://dev.fiftyone.ai:5151", {
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
};

document.addEventListener("DOMContentLoaded", () =>
  ReactDOM.render(
    <RecoilRoot>
      <Auth0Provider
        audience="api.dev.fiftyone.ai"
        clientId="pJWJhgTswZu2rF0OUOdEC5QZdNtqsUIE"
        domain="login.dev.fiftyone.ai"
        organization={"org_wtMMZE61j2gnmxsm"}
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
