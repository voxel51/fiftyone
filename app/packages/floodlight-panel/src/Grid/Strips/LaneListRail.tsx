/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import styles from "./Strips.module.css";

import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { groupDigits, labelTicks } from "../../rail/model";
import RankRail from "../../rail/RankRail";
import useListRail from "../../rail/useListRail";
import type { ValueCount } from "../categorical";

const TICKS = 5;
const LANE = '[data-cy="lane"]';

/**
 * A rail over the lane list, one rank per lane. It sits beside the scroller
 * rather than in it, so it stays put while the lanes scroll.
 */
export default function LaneListRail({
  root,
  values,
}: {
  root: HTMLElement | null;
  values: readonly ValueCount[];
}) {
  const rail = useListRail({ root, selector: LANE });
  const ticks = useMemo(
    () =>
      labelTicks(
        values.map(({ label }, rank) => ({ label, rank })),
        values.length,
        TICKS,
      ),
    [values],
  );

  useEffect(() => {
    root?.classList.add(styles.railed);
    return () => root?.classList.remove(styles.railed);
  }, [root]);

  const dock = root?.parentElement;
  if (!dock) return null;

  return createPortal(
    <RankRail
      aria-label="Lane list rail"
      anchorRank={rail.anchorRank}
      label={(rank) =>
        `${values[rank]?.label} · ${groupDigits(values[rank]?.count ?? 0)}`
      }
      onJump={(position) => rail.jump(position, values.length)}
      ticks={ticks}
      total={values.length}
      visible={rail.visible}
    />,
    dock,
  );
}
