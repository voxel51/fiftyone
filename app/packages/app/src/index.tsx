import { Loading, Theme } from "@fiftyone/components";
import { darkTheme, getEventSource, toCamelCase } from "@fiftyone/utilities";
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { RecoilRoot, useRecoilValue } from "recoil";

import Setup from "./components/Setup";

import { useScreenshot } from "./utils/hooks";

import "./index.css";
import makeRoutes from "./makeRoutes";
import Network from "./Network";
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

// built in plugins
import "@fiftyone/map";
import "@fiftyone/looker-3d";

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

  useEffect(() => {
    document.body.classList.toggle("noscroll", isModalActive);
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
            case Events.REFRESH_APP:
              refresh();
              break;
            case Events.STATE_UPDATE: {
              const { colorscale, config, ...data } = JSON.parse(
                msg.data
              ).state;

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
                variables: dataset ? { view: state.view || null } : undefined,
              });

              break;
            }
          }
        },
        onclose: () => {
          clearModal();
          setReadyState(AppReadyState.CLOSED);
        },
      },
      controller.signal,
      {
        initializer: getDatasetName(contextRef.current),
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

  const plugins = usePlugins();
  const loadingElement = <Loading>Pixelating...</Loading>;

  switch (readyState) {
    case AppReadyState.CONNECTING:
      return loadingElement;
    case AppReadyState.OPEN:
      if (plugins.isLoading) return loadingElement;
      if (plugins.error) return <div>Plugin error...</div>;
      return <Network environment={environment} context={context} />;
    default:
      return <Setup />;
  }
};

createRoot(document.getElementById("root") as HTMLDivElement).render(
  <RecoilRoot>
    <EventsContext.Provider value={{ session: null }}>
      <Theme theme={darkTheme}>
        <App />
      </Theme>
    </EventsContext.Provider>
  </RecoilRoot>
);
