import { Auth0Provider, useAuth0 } from "@auth0/auth0-react";
import React, { useEffect } from "react";
import ReactDOM from "react-dom";
import { RelayEnvironmentProvider } from "react-relay/hooks";
import { ThemeProvider as LegacyThemeContext } from "styled-components";

import Loading from "@fiftyone/app/src/components/Loading";

import "./index.css";

import { getRelayEnvironment } from "./RelayEnvironment";
import routes from "./routes";
import RoutingContext from "./routing/RoutingContext";
import createRouter from "./routing/createRouter";
import RouterRenderer from "./routing/RouteRenderer";
import { ThemeContext, useTheme } from "./Theme";
import { RecoilRoot } from "recoil";

const router = createRouter(routes);

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

const Environment = () => {
  const auth0 = useAuth0();

  useEffect(() => {
    if (!auth0.isAuthenticated && !auth0.isLoading) {
      auth0.loginWithRedirect({
        redirectUri: window.location.href,
      });
    }
  }, [auth0.isAuthenticated, auth0.isLoading]);

  if (auth0.isLoading || !auth0.isAuthenticated) {
    return <Loading text={"Loading..."} />;
  }

  return (
    <RelayEnvironmentProvider environment={getRelayEnvironment(auth0)}>
      <RoutingContext.Provider value={router.context}>
        <RouterRenderer />
      </RoutingContext.Provider>
    </RelayEnvironmentProvider>
  );
};

const Root = () => {
  return (
    <RecoilRoot>
      <Auth0Provider
        domain="dev-uqppzklh.us.auth0.com"
        clientId="pJWJhgTswZu2rF0OUOdEC5QZdNtqsUIE"
        redirectUri={window.location.origin}
      >
        <App />
      </Auth0Provider>
    </RecoilRoot>
  );
};

document.addEventListener("DOMContentLoaded", () =>
  ReactDOM.render(<Root />, document.getElementById("root"))
);
