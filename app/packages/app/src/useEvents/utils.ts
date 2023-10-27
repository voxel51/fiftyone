import { ColorSchemeInput } from "@fiftyone/relay";
import { State, ensureColorScheme, useSessionSetter } from "@fiftyone/state";
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
  setter: ReturnType<typeof useSessionSetter>,
  state: any
): Partial<LocationState<DatasetPageQuery>> => {
  if (env().VITE_NO_STATE) {
    return { view: [], fieldVisibility: undefined };
  }
  setter(
    "colorScheme",
    ensureColorScheme(state.color_scheme as ColorSchemeInput)
  );
  setter("sessionGroupSlice", state.group_slice);
  setter("selectedSamples", new Set(state.selected));
  setter(
    "selectedLabels",
    toCamelCase(state.selected_labels) as State.SelectedLabel[]
  );
  state.spaces && setter("sessionSpaces", state.spaces);
  setter("fieldVisibilityStage", state.field_visibility_stage || undefined);

  return {
    view: state.view || [],
    fieldVisibility: state.field_visibility_stage,
  };
};
