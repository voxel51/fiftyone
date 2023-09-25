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
    colorPool:
      colorScheme.color_pool || colorScheme.colorPool || defaultValue.colorPool,
    colorBy:
      colorScheme.color_by || colorScheme.colorBy || defaultValue.colorBy,
    opacity: colorScheme.opacity || defaultValue.opacity,
    useMultiColorKeypoints:
      colorScheme.use_multi_color_keypoints ||
      colorScheme.useMultiColorKeypoints ||
      defaultValue.useMultiColorKeypoints,
    showKeypointSkeleton:
      colorScheme.show_keypoint_skeleton || colorScheme.showKeypointSkeleton,
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
