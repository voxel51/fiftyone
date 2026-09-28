/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { createContext } from "react";
import type { ValueCount } from "../categorical";
import type { CellSource } from "./cellSource";
import type { HScroll } from "./hscroll";

/** What each windowed matrix row needs to lay out its cells. */
export interface MatrixModel {
  colField: string;
  cols: ValueCount[];
  colWidth: number;
  /** Floodlight's inset of each row, which the header matches. */
  gutter: number;
  rowField: string;
  rowHeadWidth: number;
  rows: ValueCount[];
  scroll: HScroll;
  sourceFor: (row: ValueCount, col: ValueCount, index: number) => CellSource;
  /** Width of the visible column area, right of the row headers. */
  trackWidth: number;
}

export const MatrixContext = createContext<MatrixModel | null>(null);
