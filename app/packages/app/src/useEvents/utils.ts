import { ColorSchemeInput } from "@fiftyone/relay";
import { State, ensureColorScheme, useSessionSetter } from "@fiftyone/state";
import { env, toCamelCase } from "@fiftyone/utilities";
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

  const visibility = state.field_visibility_stage;
  console.log("processState:fieldVisibilityStage", visibility);
  const visibilityStage = visibility
    ? {
        _cls: visibility.cls,
        kwargs: [
          ["field_names", visibility.field_names],
          ["_allow_missing", true],
        ],
      }
    : null;
  console.log("processState:visibilityStage", visibilityStage);
  const stageAtom = visibility
    ? {
        cls: visibility.cls,
        kwargs: {
          field_names: visibility.field_names,
          allow_missing: true,
        },
      }
    : undefined;

  console.log("stage", visibility);
  stageAtom && setter("fieldVisibilityStage", stageAtom);
  return env().VITE_NO_STATE
    ? { view: [], extendedStages: [] }
    : {
        view: state.view || [],
        extendedStages: visibilityStage ? [visibilityStage as State.Stage] : [],
      };
};
