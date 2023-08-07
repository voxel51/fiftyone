import { ErrorBoundary, Loading, ThemeProvider } from "@fiftyone/components";
import { Setup, makeRoutes } from "@fiftyone/core";
import { usePlugins } from "@fiftyone/plugins";
import {
  BeforeScreenshotContext,
  EventsContext,
  State,
  activeColorField,
  getDatasetName,
  getSavedViewName,
  isModalActive,
  screenshotCallbacks,
  stateSubscription,
  useClearModal,
  useRefresh,
  useReset,
  useRouter,
  useScreenshot,
} from "@fiftyone/state";
import { env, getEventSource, toCamelCase } from "@fiftyone/utilities";
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { RecoilRoot, useRecoilValue } from "recoil";
import Network from "./Network";

import "./index.css";

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
  const { context, environment } = useRouter(makeRoutes, []);
  const refresh = useRefresh();
  const contextRef = useRef(context);
  contextRef.current = context;
  const reset = useReset();
  const clearModal = useClearModal();

  useEffect(() => {
    readyState === AppReadyState.CLOSED && reset();
  }, [readyState, reset]);

  const screenshot = useScreenshot(
    new URLSearchParams(window.location.search).get("context")
  );

  const isModalOpen = useRecoilValue(isModalActive);
  const isCustomizeColorModalActive = Boolean(useRecoilValue(activeColorField));
  const handleError = useErrorHandler();

  useEffect(() => {
    document.getElementById("modal")?.classList.toggle("modalon", isModalOpen);
  }, [isModalOpen]);
  useEffect(() => {
    document
      .getElementById("colorModal")
      ?.classList.toggle("modalon", isCustomizeColorModalActive);
  }, [isCustomizeColorModalActive]);

  useEffect(() => {
    if (env().VITE_NO_STATE) {
      setReadyState(AppReadyState.OPEN);
      return;
    }

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

              payload.refresh && refresh();
              const state = {
                ...toCamelCase(data),
                view: data.view,
              } as State.Description;

              if (readyStateRef.current !== AppReadyState.OPEN) {
                setReadyState(AppReadyState.OPEN);
              }

              const searchParams = new URLSearchParams(
                context.history.location.search
              );

              if (state.savedViewSlug) {
                searchParams.set(
                  "view",
                  encodeURIComponent(state.savedViewSlug)
                );
              } else {
                searchParams.delete("view");
              }

              let search = searchParams.toString();
              if (search.length) {
                search = `?${search}`;
              }

              const path = state.dataset
                ? `/datasets/${encodeURIComponent(state.dataset)}${search}`
                : `/${search}`;

              contextRef.current.history.replace(path, {
                state,
                colorscale,
                config,
                refresh: payload.refresh,
                // REQUIRED: here we define DatasetQuery GraphQL variables
                variables: state.dataset
                  ? { view: state.view || null }
                  : undefined,
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
        initializer: {
          dataset: getDatasetName(contextRef.current),
          view: getSavedViewName(contextRef.current),
        },
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
      if (plugins.hasError) return <Loading>Plugin error...</Loading>;
      return <Network environment={environment} context={context} />;
    default:
      return <Setup />;
  }
};

createRoot(document.getElementById("root") as HTMLDivElement).render(
  <RecoilRoot>
    <ThemeProvider>
      <ErrorBoundary>
        <BeforeScreenshotContext.Provider value={screenshotCallbacks}>
          <EventsContext.Provider
            value={{ session: env().VITE_NO_STATE ? undefined : null }}
          >
            <App />
          </EventsContext.Provider>
        </BeforeScreenshotContext.Provider>
      </ErrorBoundary>
    </ThemeProvider>
  </RecoilRoot>
);
