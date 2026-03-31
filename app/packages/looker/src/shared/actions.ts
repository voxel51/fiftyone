/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Shared looker actions used by both Looker (image/video) and Lighter (e.g. annotate mode).
 * Import from here when you need readActions or the common control definitions (json, resetZoom, selectSample).
 */

import type { BaseState, Control, ControlMap } from "../state";

export const readActions = <State extends BaseState>(
  actions: ControlMap<State>
): ControlMap<State> => {
  return Object.fromEntries(
    Object.entries(actions).reduce<[string, Control<State>][]>(
      (acc, [_, v]) => {
        if (Array.isArray(v.eventKeys)) {
          return [
            ...acc,
            ...v.eventKeys.map((key) => [key, v] as [string, Control<State>]),
          ];
        }

        return [
          ...acc,
          [v.eventKeys || v.shortcut, v] as [string, Control<State>],
        ];
      },
      []
    )
  );
};

export const json: Control = {
  title: "JSON",
  shortcut: "j",
  detail: "View JSON",
  action: (_update, dispatchEvent) => {
    dispatchEvent("panels", { showJSON: "toggle" });
  },
};

export const resetZoom: Control = {
  title: "Reset zoom",
  shortcut: "r",
  detail: "Reset zoom to default",
  action: (update) => {
    update({ setZoom: true });
  },
};

export const selectSample: Control = {
  title: "Select or Deselect Sample",
  shortcut: "x",
  detail: "Grid → Control + Click",
  action: () => null,
};
