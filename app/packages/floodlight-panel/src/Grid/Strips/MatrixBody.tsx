/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The virtualized matrix: rows come from one vertical Floodlight instance
 * (an item per row, so only rows near the viewport exist), and columns are
 * windowed within each row from one shared horizontal scroll position.
 */

import gridStyles from "../Grid.module.css";
import styles from "./Strips.module.css";

import Spotlight from "@fiftyone/floodlight";
import { useContext, useEffect, useMemo, useRef } from "react";
import { createOwnership, scopeRenderer } from "../../host/ownership";
import useHost from "../../host/useHost";
import type { ValueCount } from "../categorical";
import { createCellSources } from "./cellSource";
import { StripsContext } from "./context";
import { HoverKeysContext, useHoverKeys } from "./hoverKeys";
import { createHScroll } from "./hscroll";
import { MatrixContext, type MatrixModel } from "./matrixContext";
import {
  CELL_RECORD_SPAN,
  columnWidth,
  keyOf,
  rowHeadWidth,
} from "./matrixLayout";
import { ColumnHeads } from "./MatrixHeads";
import { createRowSource, createRowStore, type RowData } from "./rowPages";
import MatrixRows from "./MatrixRows";
import useElementSize from "./useElementSize";
import useHorizontalScroll from "./useHorizontalScroll";

type Instance = Spotlight<number, RowData>;

// a resize in progress lays out shimmering rows; stacks wait for it to settle
const SHIMMER = {
  detachItem: () => undefined,
  hideItem: () => undefined,
  showItem: ({ element }: { element: HTMLDivElement }) => {
    element.classList.add(gridStyles.tileShimmer);
    return Promise.resolve(0);
  },
};

export default function MatrixBody({
  colField,
  cols,
  rowField,
  rowHeight,
  rows,
}: {
  colField: string;
  cols: ValueCount[];
  rowField: string;
  rowHeight: number;
  rows: ValueCount[];
}) {
  const strips = useContext(StripsContext)!;
  const root = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const size = useElementSize(body);
  const hoverKeys = useHoverKeys();

  const scroll = useMemo(() => createHScroll(), []);
  const store = useMemo(() => createRowStore(), []);
  const ownership = useMemo(() => createOwnership(), []);
  const source = useMemo(
    () => createRowSource(rows.length, (index) => keyOf(rows[index])),
    [rows],
  );
  const sourceFor = useMemo(
    () => createCellSources(strips, rowField, colField, CELL_RECORD_SPAN),
    [colField, rowField, strips],
  );

  const headWidth = useMemo(() => rowHeadWidth(rows), [rows]);
  const trackWidth = Math.max(0, (size?.width ?? 0) - headWidth);
  const colWidth = columnWidth(rowHeight, trackWidth, cols.length);
  useHorizontalScroll({ bar, root, scroll });

  const { host } = useHost<number, Instance>({
    ref: body,
    // rows have a fixed height, so a new width is a new row aspect ratio
    axis: "width",
    build: (anchor, context) => {
      const interim = context?.interim ?? false;
      const aspectRatio = (body.current?.clientWidth || 1) / rowHeight;
      return new Spotlight<number, RowData>({
        ...(interim ? SHIMMER : scopeRenderer(store.renderer, ownership)),
        at: anchor?.at,
        get: async (key) => {
          const page = await source.get(key);
          return {
            ...page,
            items: page.items.map((item) => ({ ...item, aspectRatio })),
          };
        },
        key: anchor?.key ?? 0,
        offset: 0,
        rowAspectRatioThreshold: () => 0,
        scrollbar: true,
        spacing: 0,
      });
    },
  });

  const built = useRef<{ source: unknown; rowHeight: number }>();
  useEffect(() => {
    if (!host) return;
    const last = built.current;
    built.current = { rowHeight, source };
    if (last?.source === source) {
      last.rowHeight !== rowHeight && host.rebuild();
    } else {
      host.rebuild({ key: 0 });
    }
  }, [host, rowHeight, source]);

  const model = useMemo<MatrixModel>(
    () => ({
      colField,
      cols,
      colWidth,
      rowField,
      rowHeadWidth: headWidth,
      rows,
      scroll,
      sourceFor,
      trackWidth,
    }),
    [
      colField,
      cols,
      colWidth,
      headWidth,
      rowField,
      rows,
      scroll,
      sourceFor,
      trackWidth,
    ],
  );

  return (
    <MatrixContext.Provider value={model}>
      <HoverKeysContext.Provider value={hoverKeys}>
        <div ref={root} className={styles.matrixView}>
          <ColumnHeads />
          <div ref={body} className={styles.matrixBody} />
          <div
            ref={bar}
            className={styles.matrixBar}
            style={{ marginLeft: headWidth }}
          >
            <div style={{ width: cols.length * colWidth, height: 1 }} />
          </div>
          <MatrixRows rows={rows} store={store} />
        </div>
      </HoverKeysContext.Provider>
    </MatrixContext.Provider>
  );
}
