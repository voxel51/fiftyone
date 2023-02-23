import { Loading } from "@fiftyone/components";
import {
  collapseFields,
  resolveGroups,
  State,
  stateSubscription,
  transformDataset,
  useClearModal,
  useRefresh,
  useReset,
  useScreenshot,
} from "@fiftyone/state";
import { getEventSource, toCamelCase } from "@fiftyone/utilities";
import React, { useRef, useState } from "react";
import { useErrorHandler } from "react-error-boundary";
import { useRecoilValue } from "recoil";
import { RecoilSync } from "recoil-sync";
import { GraphQLResponseWithData } from "relay-runtime";

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
                setReadyState(AppReadyState.OPEN);
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

              router.history.replace(path, {
                view: state.view || null,
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
          dataset: getDatasetName(router.history.location),
          view: getSavedViewName(router.history.location),
        },
        subscription,
        events: [Events.DEACTIVATE_NOTEBOOK_CELL, Events.STATE_UPDATE],
      }
    );

    return () => controller.abort();
  }, []);

  const sidebarGroupsRef = useRef<State.SidebarGroup[]>();

  const HANDLERS = {
    datasetQuery: (itemKey: string, response: State.Dataset) => {
      switch (itemKey) {
        case "dataset":
          return response;

        case "sidebarGroupsDefinition__false":
          sidebarGroupsRef.current = resolveGroups(
            response,
            sidebarGroupsRef.current
          );
          return sidebarGroupsRef.current;
        case "view":
          return;
        default:
          break;
      }
    },
    pagesQuery: (itemKey: string, _: GraphQLResponseWithData) => {
      switch (itemKey) {
        case "dataset":
          return null;
        case "sidebarGroupsDefinition__false":
          return null;
        case "view":
          return null;
        default:
          break;
      }
    },
  };

  return (
    <>
      {readyState === AppReadyState.CLOSED && <Setup />}
      {readyState === AppReadyState.CONNECTING && (
        <Loading>Pixelating...</Loading>
      )}
      {readyState === AppReadyState.OPEN && (
        <RecoilSync
          storeKey="router"
          read={(itemKey) => {
            return pullQuery(router).then((query) => {
              return query.source
                ?.toPromise()
                .then((data) =>
                  HANDLERS[query.name](itemKey, PROCESSORS[query.name](data))
                );
            });
          }}
          listen={({ updateAllKnownItems }) => {
            return router.subscribe(() => {
              pullQuery(router).then((query) => {
                query.source?.toPromise().then((data) => {
                  const items = [
                    "dataset",
                    "sidebarGroupsDefinition__false",
                    "view",
                  ].reduce((map, itemKey) => {
                    map.set(
                      itemKey,
                      HANDLERS[query.name](
                        itemKey,
                        PROCESSORS[query.name](data)
                      )
                    );

                    return map;
                  }, new Map());

                  updateAllKnownItems(items);
                });
              });
            });
          }}
          write={({ diff }) => {
            console.log(diff);
          }}
        >
          {children}
        </RecoilSync>
      )}
    </>
  );
};

const PROCESSORS = {
  datasetQuery: (response: GraphQLResponseWithData) => {
    const dataset = { ...transformDataset(response.data.dataset) };
    dataset.sampleFields = collapseFields(dataset.sampleFields);
    dataset.frameFields = collapseFields(dataset.frameFields);

    return dataset;
  },
  pagesQuery: (_: GraphQLResponseWithData) => null,
};

const pullQuery = (router: RoutingContext<Queries>) => {
  return router.get().prepared.load();
};

export default Sync;
