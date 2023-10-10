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

  const visibility = state.field_visibility;
  // const stage = visibility
  //   ? {
  //       visibility.cls,
  //       kwargs: [
  //         ["field_names", visibility.field_names.field_names],
  //         ["_allow_missing", visibility.field_names.allow_missing],
  //       ],
  //     }
  //   : null;
  const stage = visibility
    ? {
        cls: "fiftyone.core.stages.ExcludeFields",
        _cls: "fiftyone.core.stages.ExcludeFields",
        kwargs: [
          ["field_names", visibility.field_names.field_names],
          ["_allow_missing", visibility.field_names.allow_missing],
        ],
      }
    : null;

  console.log("stage", visibility);
  stage &&
    setter("fieldVisibilityStage", {
      ...stage,
      kwargs: Object.fromEntries(stage?.kwargs),
    });
  return env().VITE_NO_STATE
    ? { view: [], extendedStages: [] }
    : {
        view: state.view || [],
        extendedStages: {} ? [stage as State.Stage] : [],
        // extendedStages: {} ? [stage as State.Stage] : [],
      };
};
