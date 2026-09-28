/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Matrix geometry: the row header column, the column width, and which
 * columns a horizontal scroll position brings into view.
 */

import { SCROLLBAR_WIDTH } from "@fiftyone/floodlight/src/constants";
import type { ValueCount } from "../categorical";

/** Columns mounted past each edge of the horizontal viewport. */
export const OVERSCAN = 1;

const HEAD_MIN = 96;
const HEAD_MAX = 192;
const CHAR = 7;
const HEAD_CHROME = 24;

/** Record indices are only compared within a cell, so cells get disjoint ranges. */
export const CELL_RECORD_SPAN = 1e6;

export interface Range {
  start: number;
  end: number;
}

export const keyOf = (entry: ValueCount) => JSON.stringify(entry.value);

/** Wide enough for the longest label and its count, within bounds. */
export const rowHeadWidth = (rows: ValueCount[]) => {
  const longest = rows.reduce(
    (most, row) =>
      Math.max(most, row.label.length + row.count.toLocaleString().length + 1),
    0,
  );
  return Math.min(HEAD_MAX, Math.max(HEAD_MIN, longest * CHAR + HEAD_CHROME));
};

/** Columns fill the track when few, else keep a minimum width and scroll. */
export const columnWidth = (
  rowHeight: number,
  trackWidth: number,
  count: number,
) =>
  Math.max(
    rowHeight * 2,
    count && trackWidth > 0 ? Math.floor(trackWidth / count) : 0,
  );

export const columnWindow = (
  scrollX: number,
  trackWidth: number,
  colWidth: number,
  count: number,
  overscan = OVERSCAN,
): Range => {
  if (!count || colWidth <= 0 || trackWidth <= 0) return { start: 0, end: 0 };
  const x = Math.max(0, scrollX);
  return {
    start: Math.max(0, Math.floor(x / colWidth) - overscan),
    end: Math.min(count, Math.ceil((x + trackWidth) / colWidth) + overscan),
  };
};

/**
 * Floodlight insets every row by its scrollbar gutter on both sides, so the
 * header, which sits outside the instance, takes the same inset.
 */
export const ROW_GUTTER = SCROLLBAR_WIDTH;

export interface MatrixGeometry {
  /** Inset of the header and each row from the matrix's left and right. */
  gutter: number;
  /** The row header column, shared by the corner and every row. */
  headWidth: number;
  /** A row's width: Floodlight's cross extent. */
  rowWidth: number;
  /** The visible column area, right of the row headers. */
  trackWidth: number;
  colWidth: number;
}

/** One geometry for the header and the rows, from the matrix body's width. */
export const matrixGeometry = (
  bodyWidth: number,
  rowHeight: number,
  rows: ValueCount[],
  columns: number,
): MatrixGeometry => {
  const rowWidth = Math.max(0, bodyWidth - 2 * ROW_GUTTER);
  const headWidth = rowHeadWidth(rows);
  const trackWidth = Math.max(0, rowWidth - headWidth);
  return {
    colWidth: columnWidth(rowHeight, trackWidth, columns),
    gutter: ROW_GUTTER,
    headWidth,
    rowWidth,
    trackWidth,
  };
};

/** Column `c`'s left edge from the matrix's left, at horizontal scroll `x`. */
export const columnLeft = (geometry: MatrixGeometry, c: number, x: number) =>
  geometry.gutter + geometry.headWidth + c * geometry.colWidth - x;
