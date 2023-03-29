import { Loading } from "@fiftyone/components";
import {
  setDataset,
  setDatasetMutation,
  setSelected,
  setSelectedLabels,
  setSelectedLabelsMutation,
  setSelectedMutation,
  setSpaces,
  setSpacesMutation,
  setView,
  setViewMutation,
  Writer,
} from "@fiftyone/relay";
import { SpaceNodeJSON } from "@fiftyone/spaces";
import {
  State,
  stateSubscription,
  useClearModal,
  useReset,
  useScreenshot,
  viewsAreEqual,
} from "@fiftyone/state";
import { getEventSource, toCamelCase } from "@fiftyone/utilities";
import { Action } from "history";
import React, { useMemo, useRef, useState } from "react";
import { useErrorHandler } from "react-error-boundary";
import { DefaultValue, useRecoilValue } from "recoil";
import { ItemSnapshot } from "recoil-sync";
import { commitMutation } from "relay-runtime";
import Setup from "./components/Setup";
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

interface SessionData {
  selectedSamples: string[];
  selectedLabels: State.SelectedLabel[];
  spaces?: SpaceNodeJSON;
}

const Sync: React.FC<React.PropsWithChildren<{}>> = ({ children }) => {
  const [readyState, setReadyState] = useState(AppReadyState.CONNECTING);
  const readyStateRef = useRef<AppReadyState>();
  readyStateRef.current = readyState;
  const subscription = useRecoilValue(stateSubscription);
  const handleError = useErrorHandler();

  const reset = useReset();
  const clearModal = useClearModal();

  React.useEffect(() => {
    readyState === AppReadyState.CLOSED && reset();
  }, [readyState, reset]);
  const router = useRouterContext();
  const refresh = useRefresh();
  const screenshot = useScreenshot(
    new URLSearchParams(window.location.search).get("context") as
      | "ipython"
      | "colab"
      | "databricks"
      | undefined
  );
  const sessionRef = useRef<SessionData>({
    selectedSamples: [],
    selectedLabels: [],
  });
  const updateExternals = useRef<(items: ItemSnapshot) => void>();
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
              sessionRef.current.selectedLabels = toCamelCase(
                JSON.parse(msg.data).selected_labels
              ) as State.SelectedLabel[];
              updateExternals.current &&
                updateExternals.current(
                  new Map([
                    [
                      "selectedLabels",
                      new Set(sessionRef.current.selectedLabels),
                    ],
                  ])
                );
              break;
            case Events.SELECT_SAMPLES:
              sessionRef.current.selectedSamples = JSON.parse(
                msg.data
              ).sample_ids;
              updateExternals.current &&
                updateExternals.current(
                  new Map([
                    [
                      "selectedSamples",
                      new Set(sessionRef.current.selectedSamples),
                    ],
                  ])
                );
              break;
            case Events.STATE_UPDATE: {
              const payload = JSON.parse(msg.data);

              sessionRef.current.selectedSamples = payload.state.selected;
              sessionRef.current.selectedLabels = toCamelCase(
                payload.state.selected_labels
              ) as State.SelectedLabel[];
              sessionRef.current.spaces = payload.state.spaces;

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

  const external = useMemo(() => {
    return new Map<string, () => unknown>([
      ["routeEntry", () => router.get()],
      ["selectedSamples", () => new Set(sessionRef.current.selectedSamples)],
      ["selectedLabels", () => sessionRef.current.selectedLabels],
      ["sessionSpaces", () => sessionRef.current.spaces],
    ]);
  }, [router]);

  return (
    <>
      {readyState === AppReadyState.CLOSED && <Setup />}
      {readyState === AppReadyState.CONNECTING && (
        <Loading>Pixelating...</Loading>
      )}
      {readyState === AppReadyState.OPEN && (
        <Writer<Queries>
          storeKey="session"
          read={() => router.get().data}
          subscription={(update) => {
            return router.subscribe((entry, action) => {
              dispatchSideEffect(entry, action, subscription);
              update(entry.data);
            });
          }}
          writer={(itemKey, value) => {
            WRITE_HANDLERS[itemKey] &&
              WRITE_HANDLERS[itemKey](
                router,
                value,
                subscription,
                sessionRef.current
              );
          }}
          external={external}
          updateExternals={updateExternals}
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
      datasetName: getDatasetName(entry.pathname),
      subscription,
    },
  });
};

const WRITE_HANDLERS: {
  [key: string]: (
    router: RoutingContext<Queries>,
    value: any,
    subscription: string,
    session: SessionData
  ) => void;
} = {
  selectedSamples: (
    router: RoutingContext<Queries>,
    selected: Set<string> | DefaultValue,
    subscription: string,
    session: SessionData
  ) => {
    session.selectedSamples =
      selected instanceof DefaultValue ? [] : [...selected];
    commitMutation<setSelectedMutation>(
      router.get().preloadedQuery.environment,
      {
        mutation: setSelected,
        variables: {
          selected: session.selectedSamples,
          subscription,
        },
      }
    );
  },
  selectedLabels: (
    router: RoutingContext<Queries>,
    selectedLabels: State.SelectedLabel[] | DefaultValue,
    subscription: string,
    session: SessionData
  ) => {
    session.selectedLabels =
      selectedLabels instanceof DefaultValue ? [] : selectedLabels;
    commitMutation<setSelectedLabelsMutation>(
      router.get().preloadedQuery.environment,
      {
        mutation: setSelectedLabels,
        variables: {
          selectedLabels: session.selectedLabels,
          subscription,
        },
      }
    );
  },
  sessionSpaces: (
    router: RoutingContext<Queries>,
    spaces: SpaceNodeJSON,
    subscription: string,
    session: SessionData
  ) => {
    session.spaces = spaces;
    commitMutation<setSpacesMutation>(router.get().preloadedQuery.environment, {
      mutation: setSpaces,
      variables: {
        spaces,
        subscription,
      },
    });
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

    if (!viewsAreEqual(view, router.get().state.view || []) || current) {
      router.history.push(`${router.get().pathname}`, { view });
    }
  },
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
