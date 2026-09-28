/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import styles from "./Strips.module.css";

import { useContext, useMemo, useRef } from "react";
import type { ValueCount } from "../categorical";
import { fieldLaneKey, type LaneHeights, laneHeight } from "../laneHeights";
import { StripsContext } from "./context";
import LaneHandle from "./LaneHandle";
import StripTrack from "./StripTrack";

// Record indices are only compared within a lane, so lanes get disjoint ranges.
const LANE_RECORD_SPAN = 1e7;

const Lane = ({
  entry,
  height,
  onResize,
  path,
  railed,
  recordBase,
}: {
  entry: ValueCount;
  height: number;
  onResize: (height?: number) => void;
  path: string;
  railed: boolean;
  recordBase: number;
}) => {
  const strips = useContext(StripsContext)!;
  const variables = useMemo(
    () => strips.variables([[path, entry.value]]),
    [entry.value, path, strips],
  );
  const track = useRef<HTMLDivElement>(null);

  return (
    <section className={styles.lane} data-cy="lane">
      <div className={styles.laneLabel}>
        <span className={styles.value} title={entry.label}>
          {entry.label}
        </span>
        <span className={styles.count}>{entry.count.toLocaleString()}</span>
      </div>
      <div ref={track}>
        <StripTrack
          rail={
            railed
              ? {
                  className: styles.miniRail,
                  span: LANE_RECORD_SPAN,
                  total: entry.count,
                }
              : undefined
          }
          recordBase={recordBase}
          style={{ height }}
          variables={variables}
        />
      </div>
      <LaneHandle
        guideHost={strips.root}
        height={height}
        lane={track}
        onCommit={onResize}
        onReset={onResize}
      />
    </section>
  );
};

/**
 * One lane per value. A lane keeps its record range for as long as the list
 * is mounted, so a reorder as counts change never rebuilds its strip.
 */
export default function LaneRows({
  defaultHeight,
  heights,
  onResize,
  path,
  railed = false,
  values,
}: {
  defaultHeight: number;
  heights: LaneHeights;
  onResize: (key: string, height?: number) => void;
  path: string;
  /** Lanes get rank rails in place of their scrollbars. */
  railed?: boolean;
  values: ValueCount[];
}) {
  const bases = useRef(new Map<string, number>());

  return (
    <div className={styles.lanes}>
      {values.map((entry) => {
        const key = fieldLaneKey(path, entry.value);
        if (!bases.current.has(key)) {
          bases.current.set(key, bases.current.size * LANE_RECORD_SPAN);
        }
        return (
          <Lane
            key={key}
            entry={entry}
            height={laneHeight(heights, key, defaultHeight)}
            onResize={(height) => onResize(key, height)}
            path={path}
            railed={railed}
            recordBase={bases.current.get(key)!}
          />
        );
      })}
    </div>
  );
}
