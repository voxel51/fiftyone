import {
  RouteRenderer,
  RoutingContext,
  RouterContext,
  useRouter,
  withErrorBoundary,
  withTheme,
  Loading,
  EventsContext,
} from "@fiftyone/components";
import {
  darkTheme,
  getEventSource,
  setFetchFunction,
  toCamelCase,
} from "@fiftyone/utilities";
import React, { Suspense, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { useErrorHandler } from "react-error-boundary";
import { Environment, RelayEnvironmentProvider } from "react-relay";
import {
  atom,
  RecoilRoot,
  useRecoilCallback,
  useRecoilRefresher_UNSTABLE,
  useRecoilValue,
} from "recoil";

import Setup from "./components/Setup";

import { useScreenshot, useStateUpdate } from "./utils/hooks";

import "./index.css";
import { State } from "./recoil/types";
import * as viewAtoms from "./recoil/view";
import { refresher, stateSubscription } from "./recoil/selectors";
import makeRoutes from "./makeRoutes";
import { getDatasetName } from "./utils/generic";

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
      <EventsContext.Provider value={{ session: null }}>
        <RouterContext.Provider value={context}>
          <Suspense fallback={null}>
            <RouteRenderer router={context} />
          </Suspense>
        </RouterContext.Provider>
      </EventsContext.Provider>
    </RelayEnvironmentProvider>
  );
};

enum Events {
  DEACTIVATE_NOTEBOOK_CELL = "deactivate_notebook_cell",
  REFRESH_APP = "refresh_app",
  STATE_UPDATE = "state_update",
}

const App: React.FC = withTheme(
  withErrorBoundary(({}) => {
    const [readyState, setReadyState] = useState(AppReadyState.CONNECTING);
    const subscription = useRecoilValue(stateSubscription);
    const handleError = useErrorHandler();
    const refreshApp = useRecoilRefresher_UNSTABLE(refresher);

    const getView = useRecoilCallback(
      ({ snapshot }) => () => {
        return snapshot.getLoadable(viewAtoms.view).contents;
      },
      []
    );

    const { context, environment } = useRouter(
      (environment: Environment) =>
        makeRoutes(environment, {
          view: getView,
        }),
      []
    );
    const setState = useStateUpdate();

    const contextRef = useRef(context);
    contextRef.current = context;

    useEffect(() => {
      const controller = new AbortController();
      const dataset = getDatasetName();

      getEventSource(
        "/events",
        {
          onopen: async () => {
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
                const data = JSON.parse(msg.data).state;
                const state = {
                  ...toCamelCase(data),
                  view: data.view,
                } as State.Description;
                const current = getDatasetName();
                current;

                if (!state.dataset && current) {
                  contextRef.current.history.push("/");
                } else if (state.dataset && state.dataset !== current) {
                  contextRef.current.history.push(`/datasets/${state.dataset}`);
                }

                setState({ state });
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

    switch (readyState) {
      case AppReadyState.CONNECTING:
        return <Loading />;
      case AppReadyState.OPEN:
        return <Network environment={environment} context={context} />;
      default:
        AppReadyState.CLOSED;
        return <Setup />;
    }
  }),
  atom({ key: "theme", default: darkTheme })
);

createRoot(document.getElementById("root") as HTMLDivElement).render(
  <RecoilRoot>
    <App />
  </RecoilRoot>
);
