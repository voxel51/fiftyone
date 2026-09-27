/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import styles from "./Strips.module.css";

import clsx from "clsx";
import { memo, useContext } from "react";
import { useColumnWindow } from "./hscroll";
import { MatrixContext } from "./matrixContext";
import { CELL_RECORD_SPAN, keyOf } from "./matrixLayout";
import { Heading } from "./MatrixHeads";
import Stack from "./Stack";

/**
 * One matrix row inside its Floodlight tile: the row heading, then a stack
 * for each column in view. Scrolling sideways changes which cells mount,
 * never the row itself.
 */
const MatrixRow = ({ height, index }: { height: number; index: number }) => {
  const matrix = useContext(MatrixContext)!;
  const { cols, colWidth, rowField, colField } = matrix;
  const row = matrix.rows[index];
  const { start, end, visible } = useColumnWindow(
    matrix.scroll,
    matrix.trackWidth,
    colWidth,
    cols.length,
  );
  if (!row) return null;

  // cell borders sit inside each cell's box
  const size = { width: colWidth - 1, height: height - 1 };

  return (
    <div className={styles.matrixRow}>
      <Heading
        className={clsx(styles.rowHead, styles.matrixRowHead)}
        entry={row}
        style={{ width: matrix.rowHeadWidth }}
      />
      <div className={styles.matrixTrack} style={{ left: matrix.rowHeadWidth }}>
        <div className={styles.matrixCells}>
          {cols.slice(start, end).map((col, i) => {
            const c = start + i;
            const cell = index * cols.length + c;
            return (
              <Stack
                key={keyOf(col)}
                cell={`${keyOf(row)}|${keyOf(col)}`}
                className={clsx(
                  styles.cell,
                  styles.matrixCell,
                  keyOf(row) === keyOf(col) && styles.diagonal,
                )}
                // overscan cells load their page but hold no lookers
                holding={c >= visible.start && c < visible.end}
                recordBase={cell * CELL_RECORD_SPAN}
                size={size}
                source={matrix.sourceFor(row, col, cell)}
                style={{ left: c * colWidth, width: colWidth, height }}
                title={`${rowField} ${row.label} × ${colField} ${col.label}`}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default memo(MatrixRow);
