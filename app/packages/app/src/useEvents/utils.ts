import type { ColorSchemeInput } from "@fiftyone/relay";
import { subscribeBefore } from "@fiftyone/relay";
import type { SpaceNodeJSON } from "@fiftyone/spaces";
import type { SelectionType, Session, State } from "@fiftyone/state";
import { ensureColorScheme } from "@fiftyone/state";
import { env, toCamelCase } from "@fiftyone/utilities";
import { atom } from "recoil";
import type { DatasetPageQuery } from "../pages/datasets/__generated__/DatasetPageQuery.graphql";
import type { LocationState } from "../routing";
import { getParam } from "../utils";
import { AppReadyState } from "./registerEvent";

export const appReadyState = atom<AppReadyState>({
  key: "appReadyState",
  default: AppReadyState.CONNECTING,
});

export const processState = (
  session: Session,
  state: { [key: string]: unknown }
): Partial<LocationState<DatasetPageQuery>> => {
  const unsubscribe = subscribeBefore<DatasetPageQuery>(({ data }) => {
    session.colorScheme = ensureColorScheme(
      state.color_scheme as ColorSchemeInput
    );

    session.sessionGroupSlice =
      groupSlice || data.dataset?.defaultGroupSlice || undefined;
    session.selectedLabels = resolveSelectedLabels(state);
    session.selectedSamples = resolveSelected(state);
    session.sessionSpaces = workspace;
    session.fieldVisibilityStage = fieldVisibility;
    session.modalSelector = modalSelector;

    unsubscribe();
  });

  const fieldVisibility = resolveFieldVisibility(state);
  const groupSlice = resolveGroupSlice(state);
  const modalSelector = resolveModalSelector(state);
  const view = resolveView(state);
  const workspace = resolveWorkspace(session, state);

  return {
    fieldVisibility,
    groupSlice,
    modalSelector,
    view,
    workspace,
  };
};
const resolveSelected = (state: {
  selected?: string[];
  selected_samples?: Array<{ sample_id: string; type: SelectionType }>;
}) => {
  if (env().VITE_NO_STATE) {
    return new Map<string, SelectionType>();
  }

  // Prefer selected_samples (list of dicts with type info) if available
  if (state.selected_samples?.length) {
    const map = new Map<string, SelectionType>();
    for (const s of state.selected_samples) {
      map.set(s.sample_id, s.type || "default");
    }
    return map;
  }

  // Fallback: flat selected list — all default type
  const map = new Map<string, SelectionType>();
  for (const id of state.selected || []) {
    map.set(id, "default");
  }
  return map;
};

const resolveSelectedLabels = (state: { selected_labels?: string[] }) => {
  if (env().VITE_NO_STATE) {
    return [];
  }

  return (
    (toCamelCase(state.selected_labels as object) as State.SelectedLabel[]) ||
    []
  );
};

const resolveFieldVisibility = (state: {
  field_visibility?: State.FieldVisibilityStage;
}) => {
  if (env().VITE_NO_STATE) {
    return undefined;
  }

  return state.field_visibility;
};

const resolveGroupSlice = (state: { group_slice?: string }) => {
  if (env().VITE_NO_STATE) {
    return getParam("slice") || undefined;
  }

  return state.group_slice;
};

const resolveModalSelector = (state: {
  group_id?: string;
  sample_id?: string;
}) => {
  if (env().VITE_NO_STATE) {
    const groupId = getParam("groupId") || undefined;
    const id = getParam("id") || undefined;

    return groupId || id ? { groupId, id } : undefined;
  }

  return state.group_id || state.sample_id
    ? {
        groupId: state.group_id as string,
        id: state.sample_id as string,
      }
    : undefined;
};

const resolveView = (state: { view?: object[] }) => {
  if (env().VITE_NO_STATE) {
    return [];
  }

  return state.view || [];
};

const resolveWorkspace = (
  session: Session,
  state: { spaces?: SpaceNodeJSON }
) => {
  if (env().VITE_NO_STATE) {
    return session.sessionSpaces;
  }

  return state.spaces || session.sessionSpaces;
};
