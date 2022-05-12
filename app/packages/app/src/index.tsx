import {
  useRouter,
  withErrorBoundary,
  withTheme,
  Loading,
  EventsContext,
} from "@fiftyone/components";
import {
  darkTheme,
  getEventSource,
  isElectron,
  toCamelCase,
} from "@fiftyone/utilities";
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { useErrorHandler } from "react-error-boundary";
import { Environment } from "react-relay";
import { atom, RecoilRoot, useRecoilCallback, useRecoilValue } from "recoil";

import Setup from "./components/Setup";

import {
  useReset,
  useScreenshot,
  useUnprocessedStateUpdate,
} from "./utils/hooks";

import "./index.css";
import { State } from "./recoil/types";
import * as viewAtoms from "./recoil/view";
import { stateSubscription } from "./recoil/selectors";
import makeRoutes from "./makeRoutes";
import { getDatasetName } from "./utils/generic";
import { useRefresh } from "./recoil/atoms";
import Network from "./Network";

enum AppReadyState {
  CONNECTING = 0,
  OPEN = 1,
  CLOSED = 2,
}

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
    const reset = useReset();

    useEffect(() => {
      readyState === AppReadyState.CLOSED && reset();
    }, [readyState]);

    const screenshot = useScreenshot(
      new URLSearchParams(window.location.search).get("context")
    );

    useEffect(() => {
      const controller = new AbortController();

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
                let dataset = getDatasetName();
                if (readyStateRef.current !== AppReadyState.OPEN) {
                  if (dataset !== state.dataset) {
                    dataset = state.dataset;
                  }

                  setReadyState(AppReadyState.OPEN);
                } else {
                  dataset = state.dataset;
                }

                const path = state.dataset
                  ? `/datasets/${encodeURIComponent(state.dataset)}${
                      window.location.search
                    }`
                  : `/${window.location.search}`;

                if (path !== contextRef.current.get().pathname) {
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
          initializer: getDatasetName(),
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
