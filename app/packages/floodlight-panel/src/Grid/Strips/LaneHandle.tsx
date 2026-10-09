/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import handleStyles from "../laneResize.module.css";

import clsx from "clsx";
import { type RefObject, useEffect, useRef } from "react";
import { MAX_LANE_HEIGHT, MIN_LANE_HEIGHT } from "../laneHeights";
import { attachLaneResize } from "../laneResize";

/** The drag handle on a lane's bottom edge; see {@link attachLaneResize}. */
export default function LaneHandle({
  guideHost,
  height,
  lane,
  onCommit,
  onReset,
}: {
  guideHost: HTMLElement | null;
  height: number;
  /** The element whose bottom edge the handle resizes. */
  lane: RefObject<HTMLElement>;
  onCommit: (height: number) => void;
  onReset: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const latest = useRef({ guideHost, height, onCommit, onReset });
  latest.current = { guideHost, height, onCommit, onReset };

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    return attachLaneResize(element, {
      commit: (next) => latest.current.onCommit(next),
      edge: () => lane.current?.getBoundingClientRect().bottom ?? 0,
      guideHost: () => latest.current.guideHost,
      height: () => latest.current.height,
      reset: () => latest.current.onReset(),
    });
  }, [lane]);

  return (
    <div
      ref={ref}
      aria-label="Resize lane"
      aria-orientation="horizontal"
      aria-valuemax={MAX_LANE_HEIGHT}
      aria-valuemin={MIN_LANE_HEIGHT}
      aria-valuenow={height}
      className={clsx(handleStyles.handle, handleStyles.gap)}
      data-cy="lane-resize-handle"
      role="separator"
      tabIndex={0}
      title="Drag to resize, double-click to reset"
    />
  );
}
