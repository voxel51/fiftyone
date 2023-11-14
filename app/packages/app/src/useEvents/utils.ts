import { ColorSchemeInput, subscribeBefore } from "@fiftyone/relay";
import { Session, State, ensureColorScheme } from "@fiftyone/state";
import { env, toCamelCase } from "@fiftyone/utilities";
import { atom } from "recoil";
import { DatasetPageQuery } from "../pages/datasets/__generated__/DatasetPageQuery.graphql";
import { LocationState } from "../routing";
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

    session.sessionGroupSlice =
      state.group_slice ?? data.dataset?.defaultGroupSlice;
    session.selectedLabels = toCamelCase(
      state.selected_labels
    ) as State.SelectedLabel[];
    session.selectedSamples = new Set(state.selected);
    session.sessionSpaces = state.spaces || session.sessionSpaces;
    session.fieldVisibilityStage = state.field_visibility_stage || undefined;

    unsubscribe();
  });

  if (env().VITE_NO_STATE) {
    return { view: [], fieldVisibility: undefined };
  }

  return {
    view: state.view || [],
    fieldVisibility: state.field_visibility_stage,
  };
};
