import {
  Loading,
  RouteRenderer,
  RoutingContext,
  RouterContext,
  useRouter,
  withErrorBoundary,
  withTheme,
} from "@fiftyone/components";
import {
  darkTheme,
  getEventSource,
  setFetchFunction,
} from "@fiftyone/utilities";
import React, { Suspense, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { useErrorHandler } from "react-error-boundary";
import { Environment, RelayEnvironmentProvider } from "react-relay";
import { matchPath, matchRoutes } from "react-router";
import {
  atom,
  RecoilRoot,
  useRecoilRefresher_UNSTABLE,
  useRecoilValue,
} from "recoil";

import Setup from "./components/Setup";

import { useScreenshot, useUnprocessedStateUpdate } from "./utils/hooks";

import "./index.css";
import { State } from "./recoil/types";
import { refresher, stateSubscription } from "./recoil/selectors";
import makeRoutes from "./makeRoutes";

enum AppReadyState {
  CONNECTING = 0,
  OPEN = 1,
  CLOSED = 2,
}

setFetchFunction(import.meta.env.VITE_API || window.location.origin);

const Network: React.FC<{
  environment: Environment;
  context: RoutingContext<any>;
}> = ({ environment, context }) => {
  return (
    <RelayEnvironmentProvider environment={environment}>
      <RouterContext.Provider value={context}>
        <Suspense fallback={null}>
          <RouteRenderer router={context} />
        </Suspense>
      </RouterContext.Provider>
    </RelayEnvironmentProvider>
  );
};

const getDatasetName = () => {
  const result = matchPath("/datasets/:name", window.location.pathname);

  if (result) {
    return result.params.name;
  }

  return null;
};

enum Events {
  DEACTIVATE_NOTEBOOK_CELL = "deactivate_notebook_cell",
  REFRESH_APP = "refresh_app",
  STATE_UPDATE = "state_update",
}

const App = withTheme(
  withErrorBoundary(() => {
    const [readyState, setReadyState] = useState(AppReadyState.CONNECTING);
    const setState = useUnprocessedStateUpdate();
    const subscription = useRecoilValue(stateSubscription);
    const handleError = useErrorHandler();
    const refreshApp = useRecoilRefresher_UNSTABLE(refresher);
    const { context, environment } = useRouter(makeRoutes, []);

    const contextRef = useRef(context);
    contextRef.current = context;

    useEffect(() => {
      const controller = new AbortController();
      const dataset = getDatasetName();

      getEventSource(
        "/events",
        {
          onopen: async (response) => {
            setReadyState(AppReadyState.OPEN);
          },
          onmessage: (msg) => {
            switch (msg.event) {
              case Events.DEACTIVATE_NOTEBOOK_CELL:
                break;
              case Events.REFRESH_APP:
                refreshApp();
                break;
              case Events.STATE_UPDATE: {
                const state = JSON.parse(msg.data) as State.Description;
                const current = getDatasetName();

                if (!state.dataset && current) {
                  contextRef.current.history.push("/");
                } else if (state.dataset && state.dataset.name !== current) {
                  contextRef.current.history.push(
                    `/datasets/${state.dataset.name}`
                  );
                }

                setState(state);
                break;
              }
            }
          },
          onclose: () => {
            setReadyState(AppReadyState.CLOSED);
            contextRef.current.history.push("/");
          },
          onerror: (err) => {
            handleError(err);
          },
        },
        controller.signal,
        {
          initializer: dataset,
          subscription,
          events: [
            Events.DEACTIVATE_NOTEBOOK_CELL,
            Events.REFRESH_APP,
            Events.STATE_UPDATE,
          ],
        }
      );

      return () => controller.abort();
    }, []);

    useScreenshot();

    return (
      <>
        {readyState < 2 ? (
          <Network environment={environment} context={context} />
        ) : (
          <Setup />
        )}
      </>
    );
  }),
  atom({ key: "theme", default: darkTheme })
);

createRoot(document.getElementById("root") as HTMLDivElement).render(
  <RecoilRoot>
    <App />
  </RecoilRoot>
);
