import { Auth0Provider, useAuth0 } from "@auth0/auth0-react";

import React, { useEffect } from "react";
import ReactDOM from "react-dom";
import { ErrorBoundary, FallbackProps } from "react-error-boundary";
import { RelayEnvironmentProvider } from "react-relay/hooks";
import { RecoilRoot } from "recoil";
import { ThemeProvider as LegacyThemeContext } from "styled-components";

import { Error, Loading } from "@fiftyone/components";

import "./index.css";

import { getRelayEnvironment } from "./RelayEnvironment";
import Login from "./Login";
import { ThemeContext, useTheme } from "./Theme";

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

  useEffect(() => {
    redirect &&
      auth0.loginWithRedirect({
        redirectUri: `${window.location.protocol}//${window.location.host}`,
        prompt: "login",
        appState: window.location.href,
      });
  }, [redirect]);

  if (
    auth0.error ||
    (!auth0.isAuthenticated && !auth0.isLoading && !redirect)
  ) {
    return <Loading>Unauthorized</Loading>;
  }

  if (auth0.isLoading) {
    return <Loading>Pixelating...</Loading>;
  }

  return (
    <RelayEnvironmentProvider environment={getRelayEnvironment(auth0)}>
      <Login />
    </RelayEnvironmentProvider>
  );
};

const App = () => {
  const theme = useTheme();

  return (
    <LegacyThemeContext theme={theme}>
      <ThemeContext>
        <Environment />
      </ThemeContext>
    </LegacyThemeContext>
  );
};

const Root = () => {
  return (
    <ErrorBoundary FallbackComponent={ErrorPage}>
      <RecoilRoot>
        <ErrorBoundary FallbackComponent={ErrorPage}>
          <Auth0Provider
            audience="api.dev.fiftyone.ai"
            clientId="pJWJhgTswZu2rF0OUOdEC5QZdNtqsUIE"
            domain="dev-uqppzklh.us.auth0.com"
            organization={"org_wtMMZE61j2gnmxsm"}
            onRedirectCallback={(state) =>
              state.returnTo && window.location.assign(state.returnTo)
            }
          >
            <App />
          </Auth0Provider>
        </ErrorBoundary>
      </RecoilRoot>
    </ErrorBoundary>
  );
};

document.addEventListener("DOMContentLoaded", () =>
  ReactDOM.render(<Root />, document.getElementById("root"))
);
