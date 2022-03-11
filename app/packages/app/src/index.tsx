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

import { useScreenshot, useUnprocessedStateUpdate } from "./utils/hooks";

import "./index.css";
import routes from "./routes";
import { RelayEnvironmentProvider } from "react-relay";
import { State } from "./recoil/types";
import { matchRoutes } from "react-router-config";

enum AppReadyState {
  CONNECTING = 0,
  OPEN = 1,
  CLOSED = 2,
}

setFetchFunction(import.meta.env.VITE_API || window.location.origin);

const Network = withRouter(() => {
  return (
    <RelayEnvironmentProvider environment={RelayEnvironment}>
      <Suspense fallback={<Loading>Pixelating...</Loading>}>
        <RouteRenderer router={getRoutingContext()} />
      </Suspense>
    </RelayEnvironmentProvider>
  );
}, routes);

const getDatasetName = () => {
  const result = matchRoutes<{ name: string }>(
    [{ path: "/datasets/:name", isExact: true }],
    window.location.pathname
  )[0];

  if (result) {
    return result.match.params.name;
  }

  return null;
};

enum Events {
  UPDATE = "Update",
}

const App = withErrorBoundary(
  withTheme(() => {
    const [readyState, setReadyState] = useState(AppReadyState.CONNECTING);
    const setState = useUnprocessedStateUpdate();

    useEffect(() => {
      const controller = new AbortController();
      const dataset = getDatasetName();

      getEventSource(
        "/state",
        {
          onopen: async (response) => {
            setReadyState(AppReadyState.OPEN);
          },
          onmessage: (msg) => {
            if (msg.event === Events.UPDATE) {
              const state = JSON.parse(msg.data) as State.Description;
              console.log(state);
              const router = getRoutingContext();
              const current = getDatasetName();

              if (!state.dataset && current) {
                router.history.push("/");
              } else if (state.dataset && state.dataset.name !== current) {
                router.history.push(`/datasets/${state.dataset.name}`);
              }

              setState({ state });
            }
          },
          onclose: () => {
            setReadyState(AppReadyState.CLOSED);
            const router = getRoutingContext();
            router && router.history.push("/");
          },
        },
        controller.signal,
        {
          dataset,
        }
      );

      return () => controller.abort();
    }, []);

    useScreenshot();

    return <>{readyState < 2 ? <Network /> : <Setup />}</>;
  }, atom({ key: "theme", default: darkTheme }))
);

const Root = withErrorBoundary(() => {
  return (
    <RecoilRoot>
      <App />
    </RecoilRoot>
  );
});

const root = document.getElementById("root") as HTMLDivElement;

ReactDOM.render(<Root />, root);
