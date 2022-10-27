import { Loading, Setup, makeRoutes } from "@fiftyone/core";
import { useScreenshot } from "@fiftyone/state";
import { ThemeProvider } from "@fiftyone/components";
import { getEventSource, toCamelCase } from "@fiftyone/utilities";
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { RecoilRoot, useRecoilValue } from "recoil";
import Network from "./Network";

import "./index.css";
import {
  modal,
  refresher,
  State,
  stateSubscription,
  useRefresh,
  useReset,
  useClearModal,
} from "@fiftyone/state";
import { usePlugins } from "@fiftyone/plugins";
import { useRouter } from "@fiftyone/state";
import { EventsContext } from "@fiftyone/state";
import { getDatasetName } from "@fiftyone/state";

import { useErrorHandler } from "react-error-boundary";

enum AppReadyState {
  CONNECTING = 0,
  OPEN = 1,
  CLOSED = 2,
}

enum Events {
  DEACTIVATE_NOTEBOOK_CELL = "deactivate_notebook_cell",
  STATE_UPDATE = "state_update",
}

const App: React.FC = ({}) => {
  const [readyState, setReadyState] = useState(AppReadyState.CONNECTING);
  const readyStateRef = useRef<AppReadyState>();
  readyStateRef.current = readyState;
  const subscription = useRecoilValue(stateSubscription);
  const refresh = useRefresh();
  const refreshRouter = useRecoilValue(refresher);

  const { context, environment } = useRouter(makeRoutes, [
    readyState === AppReadyState.CLOSED,
    refreshRouter,
  ]);

  const contextRef = useRef(context);
  contextRef.current = context;
  const reset = useReset();
  const clearModal = useClearModal();

  useEffect(() => {
    readyState === AppReadyState.CLOSED && reset();
  }, [readyState]);

  const screenshot = useScreenshot(
    new URLSearchParams(window.location.search).get("context")
  );

  const isModalActive = Boolean(useRecoilValue(modal));
  const handleError = useErrorHandler();

  useEffect(() => {
    document
      .getElementById("modal")
      ?.classList.toggle("modalon", isModalActive);
  }, [isModalActive]);

  useEffect(() => {
    const controller = new AbortController();

    getEventSource(
      "/events",
      {
        onopen: async () => {},
        onmessage: (msg) => {
          if (controller.signal.aborted) {
            return;
          }

          switch (msg.event) {
            case Events.DEACTIVATE_NOTEBOOK_CELL:
              controller.abort();
              screenshot();
              break;
            case Events.STATE_UPDATE: {
              const payload = JSON.parse(msg.data);
              const { colorscale, config, ...data } = payload.state;

              const state = {
                ...toCamelCase(data),
                view: data.view,
              } as State.Description;
              let dataset = getDatasetName(contextRef.current);
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

              contextRef.current.history.replace(path, {
                state,
                colorscale,
                config,
                refresh: payload.refresh,
                variables: dataset ? { view: state.view || null } : undefined,
              });

              break;
            }
          }
        },
        onerror: (e) => handleError(e),
        onclose: () => {
          clearModal();
          setReadyState(AppReadyState.CLOSED);
        },
      },
      controller.signal,
      {
        initializer: getDatasetName(contextRef.current),
        subscription,
        events: [Events.DEACTIVATE_NOTEBOOK_CELL, Events.STATE_UPDATE],
      }
    );

    return () => controller.abort();
  }, []);

  const plugins = usePlugins();
  const loadingElement = <Loading>Pixelating...</Loading>;

  switch (readyState) {
    case AppReadyState.CONNECTING:
      return loadingElement;
    case AppReadyState.OPEN:
      if (plugins.isLoading) return loadingElement;
      if (plugins.error) return <Loading>Plugin error...</Loading>;
      return <Network environment={environment} context={context} />;
    default:
      return <Setup />;
  }
};

createRoot(document.getElementById("root") as HTMLDivElement).render(
  <RecoilRoot>
    <EventsContext.Provider value={{ session: null }}>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </EventsContext.Provider>
  </RecoilRoot>
);
