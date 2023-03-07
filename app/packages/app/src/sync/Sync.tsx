import { Loading } from "@fiftyone/components";
import {
  collapseFields,
  resolveGroups,
  ResponseFrom,
  State,
  stateSubscription,
  transformDataset,
  useClearModal,
  useRefresh,
  useReset,
  useScreenshot,
  viewsAreEqual,
} from "@fiftyone/state";
import { getEventSource, toCamelCase } from "@fiftyone/utilities";
import React, { startTransition, useRef, useState } from "react";
import { useErrorHandler } from "react-error-boundary";
import { DefaultValue, useRecoilValue } from "recoil";
import { RecoilSync } from "recoil-sync";
import {
  createOperationDescriptor,
  Environment,
  getRequest,
  handlePotentialSnapshotErrors,
  GraphQLResponseWithData,
  GraphQLTaggedNode,
  VariablesOf,
  readInlineData,
} from "relay-runtime";

import { datasetFragment } from "@fiftyone/relay";

import Setup from "../components/Setup";
import { datasetQuery } from "../pages/datasets/__generated__/datasetQuery.graphql";

import {
  LocationState,
  Queries,
  RoutingContext,
  useRouterContext,
} from "../routing";
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

  const sidebarGroupsRef = useRef<State.SidebarGroup[]>();

  const HANDLERS = {
    DatasetPageQuery: (
      itemKey: string,
      response: State.Dataset,
      variables: VariablesOf<datasetQuery>
    ) => {
      switch (itemKey) {
        case "dataset":
          return response;
        case "sidebarGroupsDefinition__false":
          sidebarGroupsRef.current = resolveGroups(
            response.sampleFields,
            response.frameFields,
            response,
            sidebarGroupsRef.current
          );
          return sidebarGroupsRef.current;
        case "sampleFields":
          return response.sampleFields;
        case "frameFields":
          return response.frameFields;
        case "view":
          const view = variables.savedViewSlug
            ? response.stages
            : variables.view;
          return view;
        case "viewCls":
          return response.viewCls;
        case "viewName":
          return variables.savedViewSlug || null;
        default:
          break;
      }
    },
    IndexPageQuery: (itemKey: string, _: GraphQLResponseWithData) => {
      switch (itemKey) {
        case "dataset":
          return null;
        case "sidebarGroupsDefinition__false":
          return undefined;
        case "view":
          return [];
        case "viewCls":
          return undefined;
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
            const entry = router.get();
            if (itemKey === "entry") {
              return router.get();
            }

            const { preloaded: query, data } = entry;
            return HANDLERS[query.name](
              itemKey,
              PROCESSORS[query.name](data),
              query.variables,
              router.history.location.state,
              true
            );
          }}
          listen={({ updateItems }) => {
            return router.subscribe(
              (entry) => {
                const { preloaded, data } = entry;
                const items = [
                  "dataset",
                  "sidebarGroupsDefinition__false",
                  "view",
                  "viewName",
                  "sampleFields",
                  "frameFields",
                  "viewCls",
                ].reduce((map, itemKey) => {
                  const result = HANDLERS[preloaded.name](
                    itemKey,
                    PROCESSORS[preloaded.name](data),
                    preloaded.variables,
                    router.history.location.state
                  );
                  if (result !== undefined) {
                    map.set(itemKey, result);
                  }

                  return map;
                }, new Map());

                items.set("entry", entry);

                requestAnimationFrame(() => updateItems(items));
              },
              () => {}
            );
          }}
          write={({ diff }) => {
            diff.forEach((value, key) => {
              WRITE_HANDLERS[key] && WRITE_HANDLERS[key](router, value);
            });
          }}
        >
          {children}
        </RecoilSync>
      )}
    </>
  );
};

const PROCESSORS = {
  DatasetPageQuery: (response) => {
    const data = readInlineData(datasetFragment, response);
    const dataset = { ...transformDataset(data.dataset) };
    dataset.sampleFields = collapseFields(data.dataset.sampleFields);
    dataset.frameFields = collapseFields(data.dataset.frameFields);

    return dataset;
  },
  IndexPageQuery: (_: GraphQLResponseWithData) => null,
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
  dataset: null,
  view: (
    router: RoutingContext<Queries>,
    view: DefaultValue | State.Stage[]
  ) => {
    if (view instanceof DefaultValue) {
      view = [];
    }

    console.log(
      viewsAreEqual(view, router.state.view),
      view,
      router.state.view
    );
    const params = new URLSearchParams(router.get().search);
    const current = params.get("view");

    if (!viewsAreEqual(view, router.state.view) || current) {
      router.history.push(`${router.get().pathname}`, { view });
    }
  },
  sidebarGroupsDefinition__false: null,
  viewCls: (router, viewCls) => {
    return viewCls;
  },
  sampleFields: (router, v) => {
    return v;
  },
  frameFields: (router, v) => {
    return v;
  },
};

export default Sync;
