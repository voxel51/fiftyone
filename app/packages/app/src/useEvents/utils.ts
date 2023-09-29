import { ColorSchemeInput } from "@fiftyone/relay";
import { State, useSessionSetter } from "@fiftyone/state";
import { toCamelCase } from "@fiftyone/utilities";
import { atom } from "recoil";
import { AppReadyState } from "./registerEvent";

export const appReadyState = atom<AppReadyState>({
  key: "appReadyState",
  default: AppReadyState.CONNECTING,
});

export const ensureColorScheme = (
  colorScheme: any,
  defaultValue: any
): ColorSchemeInput => {
  return {
    colorPool: toCamelCase(colorScheme).colorPool || defaultValue.colorPool,
    colorBy: toCamelCase(colorScheme).colorBy || defaultValue.colorBy,
    opacity: toCamelCase(colorScheme).opacity || defaultValue.opacity,
    useMultiColorKeypoints:
      toCamelCase(colorScheme).useMultiColorKeypoints ||
      defaultValue.useMultiColorKeypoints,
    showKeypointSkeleton:
      toCamelCase(colorScheme).showKeypointSkeleton == false ? false : true,
    fields: toCamelCase(colorScheme.fields || []) as ColorSchemeInput["fields"],
  };
};

export const processState = (
  setter: ReturnType<typeof useSessionSetter>,
  state: any
) => {
  setter(
    "colorScheme",
    ensureColorScheme(state.color_scheme as ColorSchemeInput, {
      colorPool: [],
      colorBy: "field",
      opacity: 0.7,
      useMultiColorKeypoints: false,
    })
  );
  setter("sessionGroupSlice", state.group_slice);
  setter("selectedSamples", new Set(state.selected));
  setter(
    "selectedLabels",
    toCamelCase(state.selected_labels) as State.SelectedLabel[]
  );
  state.spaces && setter("sessionSpaces", state.spaces);
};
