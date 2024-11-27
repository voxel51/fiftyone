import type { ModalSelector, State } from "@fiftyone/state";
import { viewsAreEqual } from "@fiftyone/state";
import { setPending } from "pages/state";
import { v4 } from "uuid";
import { transition } from "./transition";

export const FIELD_VISIBILITY_EVENT = "fieldVisibility";
export const MODAL_EVENT = "modal";
export const SLICE_EVENT = "slice";
export const SPACES_EVENT = "spaces";

export const CONST_EVENTS = new Set([
  FIELD_VISIBILITY_EVENT,
  MODAL_EVENT,
  SLICE_EVENT,
  SPACES_EVENT,
]);

const SKIP_EVENTS = new Set([MODAL_EVENT, SLICE_EVENT, SPACES_EVENT]);

type Events =
  | typeof FIELD_VISIBILITY_EVENT
  | typeof MODAL_EVENT
  | typeof SLICE_EVENT
  | typeof SPACES_EVENT;

export interface HistoryState {
  datasetId: string;
  datasetSlug: string;
  datasetName: string;
  event?: Events;
  fieldVisibilityStage?: State.FieldVisibilityStage;
  modalSelector?: ModalSelector;
  slice?: string;
  snapshot?: string;
  view: string | State.Stage[];
  workspaceSlug?: string;
}

export const getHistoryState = () => {
  const state = window.history.state.options.fiftyone as
    | HistoryState
    | undefined;

  if (!state) {
    throw new Error("no dataset history state");
  }

  return state;
};

export const pushHistoryState = (
  state: HistoryState | ((state: HistoryState) => HistoryState)
) => {
  requestAnimationFrame(() => {
    const current = getHistoryState();
    const next = state instanceof Function ? state(current) : state;
    const search = resolveSearchParameters(next);
    const href = `${window.location.pathname}${search}`;

    let skipTransition = false;
    if (current?.event && isReusable(next, current)) {
      skipTransition =
        (next.event && SKIP_EVENTS.has(next.event)) ||
        (current.event && SKIP_EVENTS.has(current.event));
    }

    !skipTransition && setPending();
    window.history.pushState(
      {
        ...window.history.state,
        key: v4(),
        options: {
          locale: undefined,
          _shouldResolveHref: false,
          fiftyone: { ...next },
        },
        as: href,
        url: `/datasets/[slug]/samples${resolveSearchParameters(next, {
          slug: next.datasetSlug,
        })}`,
        __N: false,
      },
      "",
      href
    );

    !skipTransition && transition(next);
  });
};

const isReusable = (next: HistoryState, current: HistoryState) => {
  if (next.datasetId !== current.datasetId) {
    return false;
  }
  if (!viewsAreEqual(next.view, current.view)) {
    return false;
  }

  if (next.snapshot !== current.snapshot) {
    return false;
  }

  return (
    SKIP_EVENTS.has(next.event || "") || SKIP_EVENTS.has(current.event || "")
  );
};

const resolveSearchParameters = (
  state: HistoryState,
  extra?: { [key: string]: string }
) => {
  const params = new URLSearchParams(window.location.search);
  params.delete("share");

  if (state.slice) {
    params.set("slice", state.slice);
  } else {
    params.delete("slice");
  }

  if (state.modalSelector?.groupId) {
    params.set("groupId", state.modalSelector.groupId);
  } else {
    params.delete("groupId");

    if (state.modalSelector?.id) {
      params.set("id", state.modalSelector.id);
    } else {
      params.delete("id");
    }
  }

  if (state.snapshot) {
    params.set("snapshot", state.snapshot);
  } else {
    params.delete("snapshot");
  }

  if (typeof state.view === "string") {
    params.set("view", state.view);
  } else {
    params.delete("view");
  }

  if (state.workspaceSlug) {
    params.set("workspace", state.workspaceSlug);
  } else {
    params.delete("workspace");
  }

  if (extra) {
    for (const key in extra) {
      params.set(key, extra[key]);
    }
  }

  const search = params.toString();

  if (search.length) {
    return `?${search}`;
  }

  return "";
};

export const replaceHistoryState = (
  state: HistoryState | ((state: HistoryState) => HistoryState)
) => {
  const next = state instanceof Function ? state(getHistoryState()) : state;
  const search = resolveSearchParameters(next);
  const href = `${window.location.pathname}${search}`;

  window.history.replaceState(
    {
      ...window.history.state,
      options: {
        ...window.history.state.options,
        fiftyone: { ...next },
      },
      as: href,
      url: `/datasets/[slug]/samples${resolveSearchParameters(next, {
        slug: next.datasetSlug,
      })}`,
    },
    "",
    href
  );
};
