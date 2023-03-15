import { Loading } from "@fiftyone/components";
import {
  State,
  stateSubscription,
  useClearModal,
  useRefresh,
  useReset,
  useScreenshot,
  viewsAreEqual,
} from "@fiftyone/state";
import { getEventSource, toCamelCase } from "@fiftyone/utilities";
import React, { useMemo, useRef, useState } from "react";
import { useErrorHandler } from "react-error-boundary";
import { DefaultValue, useRecoilValue } from "recoil";

import { Writer } from "@fiftyone/relay";

import Setup from "../components/Setup";

import { Queries, RoutingContext, useRouterContext } from "../routing";
import { getDatasetName, getSavedViewName } from "./utils";

enum Events {
  DEACTIVATE_NOTEBOOK_CELL = "deactivate_notebook_cell",
  STATE_UPDATE = "state_update",
}

enum AppReadyState {
  CONNECTING = 0,
  OPEN = 1,
  CLOSED = 2,
}

const Sync: React.FC<React.PropsWithChildren<{}>> = ({ children }) => {
  const [readyState, setReadyState] = useState(AppReadyState.CONNECTING);
  const readyStateRef = useRef<AppReadyState>();
  readyStateRef.current = readyState;
  const subscription = useRecoilValue(stateSubscription);
  const handleError = useErrorHandler();

  const refresh = useRefresh();
  const reset = useReset();
  const clearModal = useClearModal();

  React.useEffect(() => {
    readyState === AppReadyState.CLOSED && reset();
  }, [readyState, reset]);

  const screenshot = useScreenshot(
    new URLSearchParams(window.location.search).get("context") as
      | "ipython"
      | "colab"
      | "databricks"
      | undefined
  );

  const router = useRouterContext();
  React.useEffect(() => {
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
                viewName: data.view_name,
              } as State.Description;

              if (readyStateRef.current !== AppReadyState.OPEN) {
                router.load().then(() => {
                  setReadyState(AppReadyState.OPEN);
                });
              }

              const searchParams = new URLSearchParams(
                router.history.location.search
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

              //router.history.replace(path, { view: data.view || [] });

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
          dataset: getDatasetName(router.history.location),
          view: getSavedViewName(router.history.location),
        },
        subscription,
        events: [Events.DEACTIVATE_NOTEBOOK_CELL, Events.STATE_UPDATE],
      }
    );

    return () => controller.abort();
  }, []);

  const external = useMemo(() => {
    return new Map([["routeEntry", () => router.get()]]);
  }, [router]);

  return (
    <>
      {readyState === AppReadyState.CLOSED && <Setup />}
      {readyState === AppReadyState.CONNECTING && (
        <Loading>Pixelating...</Loading>
      )}
      {readyState === AppReadyState.OPEN && (
        <Writer<Queries>
          storeKey="router"
          read={() => router.get().data}
          subscription={(update) => {
            return router.subscribe((entry) => {
              update(entry.data);
            });
          }}
          writer={(itemKey, value) => {
            WRITE_HANDLERS[itemKey] && WRITE_HANDLERS[itemKey](router, value);
          }}
          external={external}
        >
          {children}
        </Writer>
      )}
    </>
  );
};

const WRITE_HANDLERS = {
  viewName: (
    router: RoutingContext<Queries>,
    slug: string | null | DefaultValue
  ) => {
    if (slug instanceof DefaultValue) {
      slug = null;
    }
    const params = new URLSearchParams(router.get().search);
    const current = params.get("view");
    if (current === slug) {
      return;
    }

    if (slug) {
      params.set("view", slug);
    } else {
      params.delete("view");
    }

    let search = params.toString();
    if (search.length) {
      search = `?${search}`;
    }

    router.history.push(`${router.get().pathname}${search}`, { view: [] });
  },
  view: (
    router: RoutingContext<Queries>,
    view: DefaultValue | State.Stage[]
  ) => {
    if (view instanceof DefaultValue) {
      view = [];
    }

    const params = new URLSearchParams(router.get().search);
    const current = params.get("view");

    if (!viewsAreEqual(view, router.get().state.view) || current) {
      router.history.push(`${router.get().pathname}`, { view });
    }
  },
  sidebarGroupsDefinition__false: null,
};

export default Sync;
