/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import styles from "./Strips.module.css";

import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  groupDigits,
  labelTicks,
  positionToOffset,
  thumbPosition,
  thumbSpan,
} from "../../rail/model";
import Rail from "../../rail/Rail";
import useListRail from "../../rail/useListRail";
import { MIN_SPAN } from "../railModes";
import type { ValueCount } from "../categorical";

const TICKS = 5;
const LANE = '[data-cy="lane"]';

/**
 * A rail over the lane list, one offset per lane. It sits beside the
 * scroller rather than in it, so it stays put while the lanes scroll.
 */
export default function LaneListRail({
  root,
  values,
}: {
  root: HTMLElement | null;
  values: readonly ValueCount[];
}) {
  const rail = useListRail({ root, selector: LANE });
  const total = values.length;
  const ticks = useMemo(
    () =>
      labelTicks(
        values.map(({ label }, offset) => ({ label, offset })),
        total,
        TICKS,
      ),
    [total, values],
  );

  useEffect(() => {
    root?.classList.add(styles.railed);
    return () => root?.classList.remove(styles.railed);
  }, [root]);

  const dock = root?.parentElement;
  if (!dock || total <= 0) return null;

  return createPortal(
    <Rail
      aria-label="Lane list rail"
      label={(position) => {
        const lane = values[positionToOffset(position, total, rail.visible)];
        return `${lane?.label} · ${groupDigits(lane?.count ?? 0)}`;
      }}
      onJump={(position) => rail.jump(position, total)}
      position={thumbPosition(rail.first, total, rail.visible)}
      span={thumbSpan(rail.visible, total, MIN_SPAN)}
      ticks={ticks}
    />,
    dock,
  );
}
