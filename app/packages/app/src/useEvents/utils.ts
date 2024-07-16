import type { ColorSchemeInput } from "@fiftyone/relay";
import { subscribeBefore } from "@fiftyone/relay";
import type { Session, State } from "@fiftyone/state";
import { ensureColorScheme } from "@fiftyone/state";
import { env, toCamelCase } from "@fiftyone/utilities";
import { atom } from "recoil";
import type { DatasetPageQuery } from "../pages/datasets/__generated__/DatasetPageQuery.graphql";
import type { LocationState } from "../routing";
import { AppReadyState } from "./registerEvent";

export const appReadyState = atom<AppReadyState>({
  key: "appReadyState",
  default: AppReadyState.CONNECTING,
});

export const processState = (
  session: Session,
  state: any
): Partial<LocationState<DatasetPageQuery>> => {
  const unsubscribe = subscribeBefore<DatasetPageQuery>(({ data }) => {
    session.colorScheme = ensureColorScheme(
      state.color_scheme as ColorSchemeInput
    );

    if (env().VITE_NO_STATE) {
      session.sessionGroupSlice = data.dataset?.defaultGroupSlice || undefined;
      return;
    }

    session.sessionGroupSlice = state.group_slice;
    session.selectedLabels = toCamelCase(
      state.selected_labels
    ) as State.SelectedLabel[];
    session.selectedSamples = new Set(state.selected);
    session.sessionSpaces = state.spaces || session.sessionSpaces;
    session.fieldVisibilityStage = state.field_visibility_stage || undefined;
    session.sessionSampleId =
      state.sample_id || state.group_id
        ? { id: state.sample_id, groupId: state.group_id }
        : undefined;

    unsubscribe();
  });

  if (env().VITE_NO_STATE) {
    return { view: [], fieldVisibility: undefined };
  }

  return {
    fieldVisibility: state.field_visibility_stage,
    groupSlice: state.group_slice,
    modalSelector: {
      groupId: state.group_id,
      id: state.sample_id,
    },
    view: state.view || [],
    workspace: state.spaces,
  };
};
