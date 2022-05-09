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
  useRecoilTransaction_UNSTABLE,
  useRecoilValue,
} from "recoil";

import Setup from "./components/Setup";

import { useScreenshot, useUnprocessedStateUpdate } from "./utils/hooks";

import "./index.css";
import { State } from "./recoil/types";
import * as viewAtoms from "./recoil/view";
import { stateSubscription } from "./recoil/selectors";
import makeRoutes from "./makeRoutes";
import { getDatasetName } from "./utils/generic";
import {
  dataset,
  selectedLabels,
  selectedSamples,
  useRefresh,
} from "./recoil/atoms";

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

enum Events {
  DEACTIVATE_NOTEBOOK_CELL = "deactivate_notebook_cell",
  REFRESH_APP = "refresh_app",
  STATE_UPDATE = "state_update",
}

const App: React.FC = withTheme(
  withErrorBoundary(({}) => {
    const [readyState, setReadyState] = useState(AppReadyState.CONNECTING);
    const readyStateRef = useRef<AppReadyState>();
    readyStateRef.current = readyState;
    const subscription = useRecoilValue(stateSubscription);
    const handleError = useErrorHandler();
    const refresh = useRefresh();

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
      [readyState === AppReadyState.CLOSED]
    );

    const setState = useUnprocessedStateUpdate();

    const contextRef = useRef(context);
    contextRef.current = context;
    const reset = useRecoilTransaction_UNSTABLE(({ reset }) => () => {
      reset(selectedSamples);
      reset(selectedLabels);
      reset(viewAtoms.view);
      reset(dataset);
      contextRef.current.history.push("/");
    });
    useEffect(() => {
      readyState === AppReadyState.CLOSED && reset();
    }, [readyState]);

    const screenshot = useScreenshot(
      new URLSearchParams(window.location.search).get("context")
    );

    useEffect(() => {
      const controller = new AbortController();
      const dataset = getDatasetName();

      getEventSource(
        "/events",
        {
          onopen: async () => {},
          onmessage: (msg) => {
            switch (msg.event) {
              case Events.DEACTIVATE_NOTEBOOK_CELL:
                screenshot();
                break;
              case Events.REFRESH_APP:
                refresh();
                break;
              case Events.STATE_UPDATE: {
                const data = JSON.parse(msg.data).state;
                const state = {
                  ...toCamelCase(data),
                  view: data.view,
                } as State.Description;
                const current = getDatasetName();
                if (readyStateRef.current !== AppReadyState.OPEN) {
                  !current &&
                    state.dataset &&
                    contextRef.current.history.push(
                      `/datasets/${state.dataset}${window.location.search}`
                    );
                  setReadyState(AppReadyState.OPEN);
                } else {
                  const path = state.dataset
                    ? `/datasets/${state.dataset}${window.location.search}`
                    : `/${window.location.search}`;
                  contextRef.current.preload(path);
                  contextRef.current.history.push(path);
                }

                setState({ state });
                break;
              }
            }
          },
          onclose: () => {
            setReadyState(AppReadyState.CLOSED);
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

    switch (readyState) {
      case AppReadyState.CONNECTING:
        return <Loading />;
      case AppReadyState.OPEN:
        return <Network environment={environment} context={context} />;
      default:
        return <Setup />;
    }
  }),
  atom({ key: "theme", default: darkTheme })
);

createRoot(document.getElementById("root") as HTMLDivElement).render(
  <RecoilRoot>
    <EventsContext.Provider value={{ session: null }}>
      <App />
    </EventsContext.Provider>
  </RecoilRoot>
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
