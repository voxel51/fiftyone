/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Per-panel layout selection, stored in the panel's state so duplicate
 * Floodlight panels can each show a different layout.
 */

import { useReverbValue } from "@fiftyone/reverb";
import { usePanelState } from "@fiftyone/spaces";
import * as fos from "@fiftyone/state";
import { useCallback, useMemo } from "react";
import { categoricalPaths } from "./categorical";
import { type LaneHeights, setLaneHeight } from "./laneHeights";

export type LayoutKind = "grid" | "groups" | "strip" | "lanes" | "matrix";

export interface LayoutState {
  layout?: LayoutKind;
  laneField?: string;
  rowField?: string;
  colField?: string;
  /** Heights set by dragging a lane's edge; see {@link LaneHeights}. */
  laneHeights?: LaneHeights;
}

const NO_HEIGHTS: LaneHeights = {};

const pick = (paths: string[], preferred?: string, fallback = 0) =>
  preferred && paths.includes(preferred)
    ? preferred
    : paths[Math.min(fallback, paths.length - 1)];

/** Defaults to the first two `.label` paths so Matrix opens as a confusion matrix. */
const defaultAxes = (paths: string[]) => {
  const labels = paths.filter((path) => path.endsWith(".label"));
  return labels.length >= 2 ? [labels[0], labels[1]] : [paths[0], paths[1]];
};

export default function usePanelLayout() {
  const [state, setState] = usePanelState<LayoutState>({});
  const [swimlanes] = fos.useGridSwimlanes();
  const groupsAvailable = fos.useGridSwimlanesAvailable();
  // tags last, so defaults pick a real field before an often-empty list
  const all = useReverbValue(categoricalPaths);
  const paths = useMemo(
    () => [
      ...all.filter((p) => p !== "tags"),
      ...all.filter((p) => p === "tags"),
    ],
    [all],
  );

  let layout: LayoutKind =
    state?.layout ?? (swimlanes && groupsAvailable ? "groups" : "grid");
  if (layout === "groups" && !groupsAvailable) layout = "grid";
  if ((layout === "lanes" || layout === "matrix") && !paths.length) {
    layout = "grid";
  }

  const [row, col] = defaultAxes(paths);
  const update = useCallback(
    (patch: LayoutState) =>
      setState((current: LayoutState | undefined) => ({
        ...current,
        ...patch,
      })),
    [setState],
  );

  return {
    colField: pick(paths, state?.colField ?? col, 1),
    groupsAvailable,
    laneField: pick(paths, state?.laneField),
    layout,
    paths,
    rowField: pick(paths, state?.rowField ?? row),
    update,
  };
}

/** This panel's custom lane heights, and a setter that resets on `undefined`. */
export function useLaneHeights() {
  const [state, setState] = usePanelState<LayoutState>({});
  const setHeight = useCallback(
    (key: string, height?: number) =>
      setState((current: LayoutState | undefined) => {
        const heights = current?.laneHeights ?? NO_HEIGHTS;
        const next = setLaneHeight(heights, key, height);
        return next === heights ? current : { ...current, laneHeights: next };
      }),
    [setState],
  );

  return { heights: state?.laneHeights ?? NO_HEIGHTS, setHeight };
}
