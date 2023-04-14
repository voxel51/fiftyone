import { Loading } from "@fiftyone/components";
import {
  setDataset,
  setDatasetMutation,
  setGroupSlice,
  setGroupSliceMutation,
  setSelected,
  setSelectedLabels,
  setSelectedLabelsMutation,
  setSelectedMutation,
  setSpaces,
  setSpacesMutation,
  Setter,
  setView,
  setViewMutation,
  Writer,
} from "@fiftyone/relay";
import { SpaceNodeJSON } from "@fiftyone/spaces";
import {
  datasetName,
  Session,
  State,
  stateSubscription,
  useClearModal,
  useScreenshot,
  useSession,
  viewStateForm_INTERNAL,
} from "@fiftyone/state";
import { getEventSource, toCamelCase } from "@fiftyone/utilities";
import { Action } from "history";
import React, { useEffect, useRef, useState } from "react";
import { useErrorHandler } from "react-error-boundary";
import { DefaultValue, useRecoilValue } from "recoil";
import { commitMutation } from "relay-runtime";
import Setup from "./components/Setup";
import { pendingEntry } from "./Renderer";
import {
  Entry,
  matchPath,
  Queries,
  RoutingContext,
  useRouterContext,
} from "./routing";
import useRefresh from "./useRefresh";

enum Events {
  DEACTIVATE_NOTEBOOK_CELL = "deactivate_notebook_cell",
  REFRESH = "refresh",
  SELECT_LABELS = "select_labels",
  SELECT_SAMPLES = "select_samples",
  SET_SPACES = "set_spaces",
  SET_GROUP_SLICE = "set_group_slice",
  STATE_UPDATE = "state_update",
  INIT = "init",
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
  const clearModal = useClearModal();
  const router = useRouterContext();
  const refresh = useRefresh();
  const screenshot = useScreenshot(
    new URLSearchParams(window.location.search).get("context") as
      | "ipython"
      | "colab"
      | "databricks"
      | undefined
  );
  const sessionRef = useRef<Session>({});
  const setter = useSession((key, value) => {
    WRITE_HANDLERS[key](router, value, subscription);
  }, sessionRef.current);

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
            case Events.REFRESH:
              refresh();
              break;
            case Events.SELECT_LABELS:
              setter(
                "selectedLabels",
                toCamelCase(
                  JSON.parse(msg.data).selected_labels
                ) as State.SelectedLabel[]
              );
              break;
            case Events.SELECT_SAMPLES:
              setter("selectedSamples", JSON.parse(msg.data).sample_ids);
              break;
            case Events.STATE_UPDATE: {
              const payload = JSON.parse(msg.data);
              setter("selectedSamples", new Set(payload.state.selected));
              setter(
                "selectedLabels",
                toCamelCase(
                  payload.state.selected_labels
                ) as State.SelectedLabel[]
              );
              setter("sessionSpaces", payload.state.spaces);

              const searchParams = new URLSearchParams(
                router.history.location.search
              );

              if (payload.state.saved_view_slug) {
                searchParams.set(
                  "view",
                  encodeURIComponent(payload.state.saved_view_slug)
                );
              } else {
                searchParams.delete("view");
              }

              let search = searchParams.toString();
              if (search.length) {
                search = `?${search}`;
              }

              const path = payload.state.dataset
                ? `/datasets/${encodeURIComponent(
                    payload.state.dataset
                  )}${search}`
                : `/${search}`;

              router.history.push(path, { view: payload.state.view || [] });
              if (readyStateRef.current !== AppReadyState.OPEN) {
                router.load().then(() => {
                  setReadyState(AppReadyState.OPEN);
                });
              }
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
          dataset: getDatasetName(router.history.location.pathname),
          view: getSavedViewName(router.history.location.search),
        },
        subscription,
        events: [
          Events.DEACTIVATE_NOTEBOOK_CELL,
          Events.REFRESH,
          Events.SELECT_LABELS,
          Events.SELECT_SAMPLES,
          Events.STATE_UPDATE,
        ],
      }
    );

    return () => controller.abort();
  }, []);

  useEffect(() => {
    return router.subscribe((entry, action) =>
      dispatchSideEffect(entry, action, subscription)
    );
  }, [router]);

  return (
    <>
      {readyState === AppReadyState.CLOSED && <Setup />}
      {readyState === AppReadyState.CONNECTING && (
        <Loading>Pixelating...</Loading>
      )}
      {readyState === AppReadyState.OPEN && (
        <Writer<Queries>
          read={() => {
            const { concreteRequest, data, preloadedQuery } = router.get();
            return {
              concreteRequest,
              data,
              preloadedQuery,
            };
          }}
          setters={
            new Map<string, Setter>([
              [
                "view",
                ({ get, set }, view: State.Stage[]) => {
                  set(pendingEntry, true);
                  if (view instanceof DefaultValue) {
                    view = [];
                  }
                  commitMutation<setViewMutation>(
                    router.get().preloadedQuery.environment,
                    {
                      mutation: setView,
                      variables: {
                        view,
                        datasetName: get(datasetName) as string,
                        subscription: get(stateSubscription),
                        form: get(viewStateForm_INTERNAL) || {},
                      },
                      onCompleted: ({ setView: view }) => {
                        sessionRef.current.selectedSamples = new Set();
                        sessionRef.current.selectedLabels = [];
                        router.history.push(`${router.get().pathname}`, {
                          view,
                        });
                      },
                    }
                  );
                },
              ],
              [
                "viewName",
                ({ set }, slug: string | DefaultValue | null) => {
                  set(pendingEntry, true);
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

                  router.history.push(`${router.get().pathname}${search}`, {
                    view: [],
                  });
                },
              ],
              [
                "groupSlice",
                (_, slice) => {
                  commitMutation<setGroupSliceMutation>(
                    router.get().preloadedQuery.environment,
                    {
                      mutation: setGroupSlice,
                      variables: {
                        slice,
                        subscription,
                      },
                    }
                  );
                },
              ],
              [
                "refreshPage",
                () => {
                  router.load(true);
                },
              ],
            ])
          }
          subscribe={(fn) => router.subscribe(fn)}
        >
          {children}
        </Writer>
      )}
    </>
  );
};

const dispatchSideEffect = (
  entry: Entry<Queries>,
  action: Action | undefined,
  subscription: string
) => {
  if (action !== "POP") {
    return;
  }
  if (entry.pathname === "/") {
    commitMutation<setDatasetMutation>(entry.preloadedQuery.environment, {
      mutation: setDataset,
      variables: {
        subscription,
      },
    });
    return;
  }

  commitMutation<setViewMutation>(entry.preloadedQuery.environment, {
    mutation: setView,
    variables: {
      view: entry.state.view,
      savedViewSlug: entry.state.savedViewSlug,
      form: {},
      datasetName: getDatasetName(entry.pathname) as string,
      subscription,
    },
  });
};

const WRITE_HANDLERS: {
  [key: string]: (
    router: RoutingContext<Queries>,
    value: any,
    subscription: string
  ) => void;
} = {
  selectedSamples: (
    router: RoutingContext<Queries>,
    selected: Set<string> | DefaultValue,
    subscription: string
  ) => {
    commitMutation<setSelectedMutation>(
      router.get().preloadedQuery.environment,
      {
        mutation: setSelected,
        variables: {
          selected:
            selected instanceof DefaultValue ? [] : Array.from(selected),
          subscription,
        },
      }
    );
  },
  selectedLabels: (
    router: RoutingContext<Queries>,
    selectedLabels: State.SelectedLabel[] | DefaultValue,
    subscription: string
  ) => {
    commitMutation<setSelectedLabelsMutation>(
      router.get().preloadedQuery.environment,
      {
        mutation: setSelectedLabels,
        variables: {
          selectedLabels:
            selectedLabels instanceof DefaultValue ? [] : selectedLabels,
          subscription,
        },
      }
    );
  },
  sessionSpaces: (
    router: RoutingContext<Queries>,
    spaces: SpaceNodeJSON,
    subscription: string
  ) => {
    commitMutation<setSpacesMutation>(router.get().preloadedQuery.environment, {
      mutation: setSpaces,
      variables: {
        spaces,
        subscription,
      },
    });
  },
};

export default Sync;

const getDatasetName = (pathname: string) => {
  const result = matchPath(
    pathname,
    {
      path: "/datasets/:name",
    },
    "",
    {}
  );

  if (result) {
    return decodeURIComponent(result.variables.name);
  }

  return null;
};

const getSavedViewName = (search: string) => {
  const params = new URLSearchParams(search);
  const viewName = params.get("view");
  if (viewName) {
    return decodeURIComponent(viewName);
  }

  return null;
};
