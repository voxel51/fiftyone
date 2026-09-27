/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import styles from "./Strips.module.css";

import clsx from "clsx";
import { type CSSProperties, useContext } from "react";
import type { ValueCount } from "../categorical";
import { useColumnWindow } from "./hscroll";
import { MatrixContext } from "./matrixContext";
import { keyOf } from "./matrixLayout";

export const Heading = ({
  className,
  entry,
  style,
}: {
  className: string;
  entry: ValueCount;
  style?: CSSProperties;
}) => (
  <div
    className={className}
    style={style}
    title={`${entry.label} (${entry.count})`}
  >
    <span className={styles.value}>{entry.label}</span>
    <span className={styles.count}>{entry.count.toLocaleString()}</span>
  </div>
);

/** The corner and the column headings in view, on the rows' scroll position. */
export const ColumnHeads = () => {
  const matrix = useContext(MatrixContext)!;
  const { start, end } = useColumnWindow(
    matrix.scroll,
    matrix.trackWidth,
    matrix.colWidth,
    matrix.cols.length,
  );

  return (
    <div className={styles.matrixHead}>
      <div
        className={clsx(styles.corner, styles.matrixCorner)}
        style={{ width: matrix.rowHeadWidth }}
      >
        <span>{matrix.rowField} ↓</span>
        <span>{matrix.colField} →</span>
      </div>
      <div className={styles.matrixTrack} style={{ left: matrix.rowHeadWidth }}>
        <div className={styles.matrixCells}>
          {matrix.cols.slice(start, end).map((col, i) => (
            <Heading
              key={keyOf(col)}
              className={clsx(styles.colHead, styles.matrixColHead)}
              entry={col}
              style={{
                left: (start + i) * matrix.colWidth,
                width: matrix.colWidth,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
