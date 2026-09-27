/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Lanes layout: one horizontal strip per value of a categorical field,
 * stacked in a vertically scrolling column.
 */

import styles from "./Strips.module.css";

import { useReverbValue } from "@fiftyone/reverb";
import { useContext, useMemo } from "react";
import { gridZoom } from "../atoms";
import { type ValueCount, useValueCounts } from "../categorical";
import { StripsContext } from "./context";
import StripsRoot from "./StripsRoot";
import StripTrack, { trackHeight } from "./StripTrack";

// Record indices are only compared within a lane, so lanes get disjoint ranges.
const LANE_RECORD_SPAN = 1e7;

const Lane = ({
  entry,
  height,
  index,
  path,
}: {
  entry: ValueCount;
  height: number;
  index: number;
  path: string;
}) => {
  const strips = useContext(StripsContext)!;
  const variables = useMemo(
    () => strips.variables([[path, entry.value]]),
    [entry.value, path, strips],
  );

  return (
    <section className={styles.lane}>
      <div className={styles.laneLabel}>
        <span className={styles.value} title={entry.label}>
          {entry.label}
        </span>
        <span className={styles.count}>{entry.count.toLocaleString()}</span>
      </div>
      <StripTrack
        recordBase={index * LANE_RECORD_SPAN}
        style={{ height }}
        variables={variables}
      />
    </section>
  );
};

const LaneList = ({ path }: { path: string }) => {
  const values = useValueCounts(path, "count");
  const height = trackHeight(useReverbValue(gridZoom), 64, 16);

  if (!values.length) {
    return <div className={styles.none}>No values</div>;
  }

  return (
    <div className={styles.lanes}>
      {values.map((entry, index) => (
        <Lane
          key={JSON.stringify(entry.value)}
          entry={entry}
          height={height}
          index={index}
          path={path}
        />
      ))}
    </div>
  );
};

export default function Lanes({ path }: { path: string }) {
  return (
    <StripsRoot>
      <LaneList path={path} />
    </StripsRoot>
  );
}
