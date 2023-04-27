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
  subscribe,
  Writer,
} from "@fiftyone/relay";
import { SpaceNodeJSON } from "@fiftyone/spaces";
import * as fos from "@fiftyone/state";
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
import React, { MutableRefObject, useRef, useState } from "react";
import { useErrorHandler } from "react-error-boundary";
import { useRelayEnvironment } from "react-relay";
import { DefaultValue, useRecoilValue } from "recoil";
import { commitMutation, IEnvironment } from "relay-runtime";
import Setup from "./components/Setup";
import { pendingEntry } from "./Renderer";
import { Entry, matchPath, Queries, useRouterContext } from "./routing";
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

export const SessionContext = React.createContext<Session>({});

const Sync: React.FC<React.PropsWithChildren<{}>> = ({ children }) => {
  const [readyState, setReadyState] = useState(AppReadyState.CONNECTING);
  const readyStateRef = useRef<AppReadyState>();
  readyStateRef.current = readyState;
  const environment = useRelayEnvironment();
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
    WRITE_HANDLERS[key](environment, value, subscription);
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
                  JSON.parse(msg.data).labels
                ) as State.SelectedLabel[]
              );
              break;
            case Events.SELECT_SAMPLES:
              setter("selectedSamples", JSON.parse(msg.data).sample_ids);
              break;
            case Events.SET_SPACES:
              setter("sessionSpaces", JSON.parse(msg.data).spaces);
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
          Events.SET_SPACES,
          Events.STATE_UPDATE,
        ],
      }
    );

    return () => controller.abort();
  }, [
    clearModal,
    handleError,
    refresh,
    router,
    screenshot,
    setter,
    subscription,
  ]);

  return (
    <SessionContext.Provider value={sessionRef.current}>
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
                  commitMutation<setViewMutation>(environment, {
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
                  });
                },
              ],
              [
                "viewName",
                ({ get, set }, slug: string | DefaultValue | null) => {
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
                  commitMutation<setViewMutation>(environment, {
                    mutation: setView,
                    variables: {
                      subscription,
                      view: [],
                      savedViewSlug: slug,
                      datasetName: get(datasetName) as string,
                      form: {},
                    },
                  });

                  router.history.push(`${router.get().pathname}${search}`, {
                    view: [],
                  });
                },
              ],
              [
                "groupSlice",
                (_, slice) => {
                  commitMutation<setGroupSliceMutation>(environment, {
                    mutation: setGroupSlice,
                    variables: {
                      slice,
                      subscription,
                    },
                  });
                },
              ],
              [
                "refreshPage",
                () => {
                  router.load(true);
                },
              ],
              [
                "similarityParameters",
                () => {
                  const unsubscribe = subscribe((_, { set }) => {
                    set(fos.similaritySorting, false);
                    set(fos.savedLookerOptions, (cur) => ({
                      ...cur,
                      showJSON: false,
                    }));
                    set(fos.hiddenLabels, {});
                    unsubscribe();
                  });

                  router.load(true);
                },
              ],
            ])
          }
          subscribe={(fn) => {
            let {
              preloadedQuery: { variables: current },
            } = router.get();
            return router.subscribe((entry, action) => {
              sessionRef.current.selectedSamples = new Set();
              sessionRef.current.selectedLabels = [];
              // @ts-ignore
              if (current.name !== entry.preloadedQuery.variables.name) {
                sessionRef.current.sessionSpaces = fos.SPACES_DEFAULT;
              }
              current = entry.preloadedQuery.variables;
              dispatchSideEffect(entry, action, subscription, sessionRef);
              fn(entry);
            });
          }}
        >
          {children}
        </Writer>
      )}
    </SessionContext.Provider>
  );
};

const dispatchSideEffect = (
  entry: Entry<Queries>,
  action: Action | undefined,
  subscription: string,
  sessionRef: MutableRefObject<Session>
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
    environment: IEnvironment,
    value: any,
    subscription: string
  ) => void;
} = {
  selectedSamples: (
    environment,
    selected: Set<string> | DefaultValue,
    subscription: string
  ) => {
    commitMutation<setSelectedMutation>(environment, {
      mutation: setSelected,
      variables: {
        selected: selected instanceof DefaultValue ? [] : Array.from(selected),
        subscription,
      },
    });
  },
  selectedLabels: (
    environment,
    selectedLabels: State.SelectedLabel[] | DefaultValue,
    subscription
  ) => {
    commitMutation<setSelectedLabelsMutation>(environment, {
      mutation: setSelectedLabels,
      variables: {
        selectedLabels:
          selectedLabels instanceof DefaultValue ? [] : selectedLabels,
        subscription,
      },
    });
  },
  sessionSpaces: (environment, spaces: SpaceNodeJSON, subscription) => {
    commitMutation<setSpacesMutation>(environment, {
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
