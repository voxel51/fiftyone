/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Per-group row heights for the Groups layout: a resize handle on each row's
 * tile, and the row aspect ratios that give each group its saved height.
 */

import type { ItemData } from "@fiftyone/floodlight";
import type * as fos from "@fiftyone/state";
import { useCallback, useMemo, useRef } from "react";
import { SLOT } from "../host/createHost";
import { groupLaneKey, rowAspectOverride } from "./laneHeights";
import { attachLaneResize, decorateHandle } from "./laneResize";
import { useLaneHeights } from "./layout";

export const groupIdOf = (
  node: unknown,
  groupField: string | null | undefined,
) => {
  const sample =
    (node as { sample?: Record<string, { _id?: string }> })?.sample ?? {};
  return groupField ? sample[groupField]?._id : undefined;
};

export default function useSwimlaneResize(groupField?: string | null) {
  const { heights, setHeight } = useLaneHeights();
  const setHeightRef = useRef(setHeight);
  setHeightRef.current = setHeight;
  // tiles are reused across rows, so each handle looks up its current group
  const groups = useMemo(() => new WeakMap<HTMLElement, string>(), []);
  const handles = useMemo(() => new WeakMap<HTMLElement, HTMLElement>(), []);

  /** Adds a handle to a row's tile, once per tile. */
  const scaffold = useCallback(
    (tile: HTMLElement) => {
      if (handles.has(tile)) return;
      const handle = document.createElement("div");
      decorateHandle(handle, tile.getBoundingClientRect().height);
      handle.dataset.cy = "lane-resize-handle";
      const resize = (height?: number) => {
        const group = groups.get(handle);
        group && setHeightRef.current(groupLaneKey(group), height);
      };
      attachLaneResize(handle, {
        commit: resize,
        edge: () => tile.getBoundingClientRect().bottom,
        guideHost: () => tile.closest<HTMLElement>(`[${SLOT}]`),
        height: () => tile.getBoundingClientRect().height,
        reset: () => resize(),
      });
      tile.appendChild(handle);
      handles.set(tile, handle);
    },
    [groups, handles],
  );

  /** Points a tile's handle at the group it now shows. */
  const bind = useCallback(
    (tile: HTMLElement, group: string | undefined, height: number) => {
      const handle = handles.get(tile);
      if (!handle) return;
      group ? groups.set(handle, group) : groups.delete(handle);
      handle.hidden = !group;
      handle.setAttribute("aria-valuenow", String(Math.round(height)));
    },
    [groups, handles],
  );

  // Groups rows hold one item each, so a row's height is its item's aspect.
  const rowAspects = useCallback(
    (width: number) =>
      rowAspectOverride<ItemData<number, fos.Sample>>(heights, width, (item) =>
        groupIdOf(item.data, groupField),
      ),
    [groupField, heights],
  );

  return { bind, heights, rowAspects, scaffold };
}
