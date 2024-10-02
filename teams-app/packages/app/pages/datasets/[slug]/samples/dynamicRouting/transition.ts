import {
  gridAt,
  gridOffset,
  gridPage,
} from "@fiftyone/core/src/components/Grid/recoil";
import { subscribe } from "@fiftyone/relay";
import type { SpaceNodeJSON } from "@fiftyone/spaces";
import {
  ensureColorScheme,
  getSessionRef,
  SPACES_DEFAULT,
} from "@fiftyone/state";
import { toSlug } from "@fiftyone/utilities";
import { loading } from "pages/state";
import { useRecoilCallback } from "recoil";
import loadPageQuery, { type Page } from "./loadPageQuery";
import {
  CONST_EVENTS,
  getHistoryState,
  type HistoryState,
  MODAL_EVENT,
  replaceHistoryState,
} from "./state";
import { type TeamsSession, writeSession } from "./useLocalSession";
import { datasetPage, pageRunner } from "./usePage";

export interface DatasetData {
  datasetId: string;
  datasetName: string;
  datasetSlug: string;
}

export type Session = Omit<TeamsSession, "datasetIdentifier">;

export const initializeSession = (session: Session, search: string) => {
  const params = new URLSearchParams(search);
  const share = params.get("share");
  if (share) {
    const data = JSON.parse(decodeURIComponent(share));
    if (data.filters) {
      getSessionRef().filters = data.filters;
    }

    if (data.modalFilters) {
      getSessionRef().modalFilters = data.modalFilters;
    }

    session.fieldVisibilityStage = data.fieldVisibilityStage;
    session.modalSelector =
      params.get("id") || params.get("groupId")
        ? {
            id: params.get("id") || undefined,
            groupId: params.get("groupId") || undefined,
          }
        : undefined;
    session.selectedLabels = [];
    session.selectedSamples = new Set();
    session.sessionGroupSlice = params.get("slice") || undefined;
    session.sessionSpaces = SPACES_DEFAULT;
    session.snapshot = params.get("snapshot") || undefined;
    session.view = params.get("view") || data.view || undefined;

    return {
      workspaceSlug: params.get("workspace") || undefined,
    };
  }

  session.sessionGroupSlice = params.get("slice") || session.sessionGroupSlice;

  const snapshot = params.get("snapshot") || undefined;
  if (snapshot && session.snapshot !== snapshot) {
    session.fieldVisibilityStage = undefined;
    session.modalSelector = undefined;
    session.selectedLabels = [];
    session.selectedSamples = new Set();
    session.sessionGroupSlice = undefined;
    session.sessionSpaces = SPACES_DEFAULT;
    session.snapshot = snapshot;
    session.view = [];
    params.delete("id");
    params.delete("workspace");
  }

  const view = params.get("view");
  if (view && session.view !== view) {
    session.fieldVisibilityStage = undefined;
    session.modalSelector = undefined;
    session.selectedLabels = [];
    session.selectedSamples = new Set();
    session.sessionGroupSlice = undefined;
    session.view = view;
    params.delete("id");
  }

  let workspace = params.get("workspace");
  if (!workspace && session.sessionSpaces?._name) {
    // if a 'workspace' parameter is not present, use the session value
    workspace = toSlug(session.sessionSpaces._name);
  }

  if (params.has("groupId")) {
    session.modalSelector = {
      groupId: params.get("groupId") || undefined,
    };
  } else if (params.has("id")) {
    session.modalSelector = {
      id: params.get("id") || undefined,
    };
  }

  if (session.modalSelector) {
    session.modalSelector = {
      id: session.modalSelector?.id,
      groupId: session.modalSelector?.groupId,
    };
  }

  return {
    workspaceSlug: workspace || undefined,
  };
};

const assignSession = (state: HistoryState, session: Session) => {
  session.modalSelector = state.modalSelector;
  session.selectedLabels = [];
  session.sessionGroupSlice = state.slice;
  session.snapshot = state.snapshot;
  session.view = state.view;

  const currentEvent = getHistoryState().event || "";
  const nextEvent = state.event || "";
  if (CONST_EVENTS.has(nextEvent) && !CONST_EVENTS.has(currentEvent)) {
    session.fieldVisibilityStage = undefined;
    session.selectedSamples = new Set<string>();
  }

  return {
    workspaceSlug: session.sessionSpaces?._name
      ? toSlug(session.sessionSpaces._name)
      : undefined,
  };
};

export const load = async (
  dataset: DatasetData,
  state?: HistoryState,
  hard = false
) => {
  let entry: Page | null = null;

  await writeSession(dataset.datasetId, async (session) => {
    const data = state
      ? // if "state" is defined, we are transitioning from an existing
        // /datasets/[slug]/samples page
        assignSession(state, session)
      : // initialize the session if we are not transitioning
        initializeSession(session, window.location.search);

    try {
      entry = await loadPageQuery(
        {
          ...dataset,
          view: session.view || [],
          snapshot: session.snapshot,
          workspaceSlug: data?.workspaceSlug,
        },
        session.fieldVisibilityStage,
        hard
      );

      if (
        typeof session.view === "string" &&
        entry.data.dataset?.savedViewSlug !== session.view
      ) {
        // only necessary because the query may not return
        // the saved view requested, i.e. an API fallback
        session.view = entry.data.dataset?.savedViewSlug || [];
        session.sessionGroupSlice = undefined;
      }

      if (entry.data.dataset?.workspace) {
        // assign the workspace defintion, if present
        session.sessionSpaces = entry.data.dataset.workspace
          .child as SpaceNodeJSON;
      }
    } catch (error) {
      session.fieldVisibilityStage = undefined;
      session.modalSelector = undefined;
      session.selectedLabels = [];
      session.selectedSamples = new Set();
      session.sessionGroupSlice = undefined;
      session.sessionSpaces = SPACES_DEFAULT;
      session.view = [];

      if (!session.view || !session.view.length) {
        throw error;
      }

      // try loading the empy dataset (or snapshot)
      entry = await loadPageQuery(
        {
          ...dataset,
          snapshot: session.snapshot,
          view: [],
        },
        undefined,
        hard
      );
    }

    session.colorScheme = ensureColorScheme(
      session.colorScheme ?? entry.data.dataset?.appConfig?.colorScheme,
      entry.data.config
    );

    session.sessionGroupSlice = session.sessionGroupSlice || undefined;

    // no state means we need to initialize (replace)
    !state &&
      replaceHistoryState({
        ...dataset,
        event: session.modalSelector ? MODAL_EVENT : undefined,
        fieldVisibilityStage: session.fieldVisibilityStage,
        modalSelector: session.modalSelector,
        slice: session.sessionGroupSlice,
        snapshot: session.snapshot,
        view: session.view || [],
        workspaceSlug: session.sessionSpaces?._name
          ? toSlug(session.sessionSpaces._name)
          : undefined,
      });
  });

  if (!entry) {
    throw new Error("no entry");
  }

  return entry;
};

export const useGridReset = () =>
  useRecoilCallback(
    ({ reset }) =>
      async () => {
        reset(gridPage);
        reset(gridAt);
        reset(gridOffset);
      },
    []
  );

export const transition = (state: HistoryState, hard = false) => {
  return load(state, hard ? undefined : state, hard).then((entry) => {
    const unsubscribe = subscribe((_, { set }) => {
      set(loading, false);
      set(datasetPage, entry);
      unsubscribe();
    });

    pageRunner(entry);
  });
};

export const transitionDataset = (dataset: DatasetData) => {
  return load(dataset).then((entry) => {
    const unsubscribe = subscribe((_, { set }) => {
      set(loading, false);
      set(datasetPage, entry);
      unsubscribe();
    });

    pageRunner(entry);
  });
};
