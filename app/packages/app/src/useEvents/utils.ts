import { ColorSchemeInput } from "@fiftyone/relay";
import { State, ensureColorScheme, useSessionSetter } from "@fiftyone/state";
import { toCamelCase } from "@fiftyone/utilities";
import { atom } from "recoil";
import { AppReadyState } from "./registerEvent";

export const appReadyState = atom<AppReadyState>({
  key: "appReadyState",
  default: AppReadyState.CONNECTING,
});

export const processState = (
  setter: ReturnType<typeof useSessionSetter>,
  state: any
) => {
  console.log("processState", state);
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
  state.field_visibility_stage &&
    setter("fieldVisibilityStage", state.field_visibility_stage);
};
