import { Auth0Provider, useAuth0 } from "@auth0/auth0-react";
import { Error, Loading, Theme, useTheme } from "@fiftyone/components";
import { setFetchFunction } from "@fiftyone/utilities";
import React, { useEffect, useLayoutEffect } from "react";
import ReactDOM from "react-dom";
import { ErrorBoundary, FallbackProps } from "react-error-boundary";
import { RelayEnvironmentProvider } from "react-relay/hooks";
import { RecoilRoot } from "recoil";
import { ThemeProvider as LegacyThemeContext } from "styled-components";

import "./index.css";

import RelayEnvironment from "./RelayEnvironment";
import Login from "./Login";
import { useState } from "react";

const ErrorPage: React.FC<FallbackProps> = ({ error, resetErrorBoundary }) => {
  return (
    <Error
      error={error}
      reset={() => {
        resetErrorBoundary();
      }}
    />
  );
};

const Environment = () => {
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
        setFetchFunction({
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

  return (
    <RelayEnvironmentProvider environment={RelayEnvironment}>
      <Login />
    </RelayEnvironmentProvider>
  );
};

const App = () => {
  const theme = useTheme();

  return (
    <LegacyThemeContext theme={theme}>
      <Theme>
        <Environment />
      </Theme>
    </LegacyThemeContext>
  );
};

const ErrorWrapper: React.FC<FallbackProps> = (props) => {
  useLayoutEffect(() => {
    document.getElementById("modal")?.classList.remove("modalon");
  }, []);

  return <ErrorPage {...props} />;
};

const Root = () => {
  return (
    <ErrorBoundary FallbackComponent={ErrorWrapper}>
      <RecoilRoot>
        <ErrorBoundary FallbackComponent={ErrorWrapper}>
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
            <App />
          </Auth0Provider>
        </ErrorBoundary>
      </RecoilRoot>
    </ErrorBoundary>
  );
};

document.addEventListener("DOMContentLoaded", () => {
  ReactDOM.render(<Root />, document.getElementById("root"));
});
