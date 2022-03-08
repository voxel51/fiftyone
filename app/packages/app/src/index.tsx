import {
  getRoutingContext,
  Loading,
  RelayEnvironment,
  RouteRenderer,
  withErrorBoundary,
  withRouter,
  withTheme,
} from "@fiftyone/components";
import {
  darkTheme,
  getEventSource,
  setFetchFunction,
} from "@fiftyone/utilities";
import React, { Suspense, useEffect, useState } from "react";
import ReactDOM from "react-dom";
import { atom, RecoilRoot } from "recoil";

import Setup from "./components/Setup";

import { useScreenshot } from "./utils/hooks";

import "./index.css";
import routes from "./routes";
import { RelayEnvironmentProvider } from "react-relay";

enum AppReadyState {
  CONNECTING = 0,
  OPEN = 1,
  CLOSED = 2,
}

setFetchFunction(import.meta.env.VITE_API || window.location.origin);

const App = withErrorBoundary(
  withRouter(
    withTheme(() => {
      const [readyState, setReadyState] = useState(AppReadyState.CONNECTING);

      useEffect(() => {
        const controller = new AbortController();

        getEventSource(
          "/state",
          {
            onopen: async (response) => {
              setReadyState(AppReadyState.OPEN);
            },
            onclose: () => {
              setReadyState(AppReadyState.CLOSED);
            },
          },
          controller.signal
        );

        return () => controller.abort();
      }, []);

      useScreenshot();

      return (
        <>
          {readyState < 2 ? (
            <Suspense fallback={<Loading>Pixelating...</Loading>}>
              <RouteRenderer router={getRoutingContext()} />
            </Suspense>
          ) : (
            <Setup />
          )}
        </>
      );
    }, atom({ key: "theme", default: darkTheme })),
    routes
  )
);

const Root = withErrorBoundary(() => {
  return (
    <RecoilRoot>
      <RelayEnvironmentProvider environment={RelayEnvironment}>
        <App />
      </RelayEnvironmentProvider>
    </RecoilRoot>
  );
});

const root = document.getElementById("root") as HTMLDivElement;

ReactDOM.render(<Root />, root);
