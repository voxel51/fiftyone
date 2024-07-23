import type { ColorSchemeInput } from "@fiftyone/relay";
import { subscribeBefore } from "@fiftyone/relay";
import type { SpaceNodeJSON } from "@fiftyone/spaces";
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
  state: { [key: string]: unknown }
): Partial<LocationState<DatasetPageQuery>> => {
  const unsubscribe = subscribeBefore<DatasetPageQuery>(({ data }) => {
    session.colorScheme = ensureColorScheme(
      state.color_scheme as ColorSchemeInput
    );

    if (env().VITE_NO_STATE) {
      session.sessionGroupSlice = data.dataset?.defaultGroupSlice || undefined;
      return;
    }

    session.sessionGroupSlice = state.group_slice as string;
    session.selectedLabels = toCamelCase(
      state.selected_labels as object
    ) as State.SelectedLabel[];
    session.selectedSamples = new Set(state.selected as string[]);
    session.sessionSpaces = (state.spaces ||
      session.sessionSpaces) as SpaceNodeJSON;
    session.fieldVisibilityStage =
      (state.field_visibility_stage as State.FieldVisibilityStage) || undefined;
    session.modalSelector = modalSelector;

    unsubscribe();
  });

  if (env().VITE_NO_STATE) {
    return { view: [], fieldVisibility: undefined };
  }

  const modalSelector =
    state.group_id || state.sample_id
      ? {
          groupId: state.group_id as string,
          id: state.sample_id as string,
        }
      : undefined;

  return {
    fieldVisibility: state.field_visibility_stage as State.FieldVisibilityStage,
    groupSlice: state.group_slice as string,
    modalSelector,
    view: state.view || [],
    workspace: state.spaces as SpaceNodeJSON,
  };
};
