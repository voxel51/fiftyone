import { useRouter, Loading, EventsContext, Theme } from "@fiftyone/components";
import { darkTheme, getEventSource, toCamelCase } from "@fiftyone/utilities";
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { RecoilRoot, useRecoilValue } from "recoil";

import Setup from "./components/Setup";

import { useReset, useScreenshot } from "./utils/hooks";

import "./index.css";
import { State } from "./recoil/types";
import { stateSubscription } from "./recoil/selectors";
import makeRoutes from "./makeRoutes";
import { getDatasetName } from "./utils/generic";
import { modal, refresher, useRefresh } from "./recoil/atoms";
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

  switch (readyState) {
    case AppReadyState.CONNECTING:
      return <Loading>Pixelating...</Loading>;
    case AppReadyState.OPEN:
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
