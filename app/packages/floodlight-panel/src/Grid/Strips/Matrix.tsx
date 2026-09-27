/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Matrix layout: rows are one field's values, columns another's, and each
 * cell is a strip of the samples matching both. Two label fields sorted by
 * confidence read as a confusion matrix of strips.
 */

import styles from "./Strips.module.css";

import { useReverbValue } from "@fiftyone/reverb";
import clsx from "clsx";
import { Fragment, useContext, useMemo } from "react";
import { gridZoom } from "../atoms";
import { type ValueCount, useValueCounts } from "../categorical";
import { StripsContext } from "./context";
import StripsRoot from "./StripsRoot";
import StripTrack, { trackHeight } from "./StripTrack";

const CELL_RECORD_SPAN = 1e6;

const keyOf = (entry: ValueCount) => JSON.stringify(entry.value);

const Heading = ({
  className,
  entry,
}: {
  className: string;
  entry: ValueCount;
}) => (
  <div className={className} title={`${entry.label} (${entry.count})`}>
    <span className={styles.value}>{entry.label}</span>
    <span className={styles.count}>{entry.count.toLocaleString()}</span>
  </div>
);

const Cell = ({
  col,
  colField,
  index,
  row,
  rowField,
}: {
  col: ValueCount;
  colField: string;
  index: number;
  row: ValueCount;
  rowField: string;
}) => {
  const strips = useContext(StripsContext)!;
  const variables = useMemo(
    () =>
      strips.variables([
        [rowField, row.value],
        [colField, col.value],
      ]),
    [col.value, colField, row.value, rowField, strips],
  );

  return (
    <StripTrack
      className={clsx(
        styles.cell,
        keyOf(row) === keyOf(col) && styles.diagonal,
      )}
      recordBase={index * CELL_RECORD_SPAN}
      variables={variables}
    />
  );
};

const Cells = ({
  colField,
  rowField,
}: {
  colField: string;
  rowField: string;
}) => {
  const rows = useValueCounts(rowField, "value");
  const cols = useValueCounts(colField, "value");
  const height = trackHeight(useReverbValue(gridZoom), 56, 8);

  if (!rows.length || !cols.length) {
    return <div className={styles.none}>No values</div>;
  }

  return (
    <div
      className={styles.matrix}
      style={{
        gridTemplateColumns: `max-content repeat(${cols.length}, minmax(${
          height * 2
        }px, 1fr))`,
        gridTemplateRows: "auto",
        gridAutoRows: `${height}px`,
      }}
    >
      <div className={styles.corner}>
        <span>{rowField} ↓</span>
        <span>{colField} →</span>
      </div>
      {cols.map((col) => (
        <Heading key={keyOf(col)} className={styles.colHead} entry={col} />
      ))}
      {rows.map((row, r) => (
        <Fragment key={keyOf(row)}>
          <Heading className={styles.rowHead} entry={row} />
          {cols.map((col, c) => (
            <Cell
              key={keyOf(col)}
              col={col}
              colField={colField}
              index={r * cols.length + c}
              row={row}
              rowField={rowField}
            />
          ))}
        </Fragment>
      ))}
    </div>
  );
};

export default function Matrix({
  colField,
  rowField,
}: {
  colField: string;
  rowField: string;
}) {
  return (
    <StripsRoot>
      <Cells colField={colField} rowField={rowField} />
    </StripsRoot>
  );
}
