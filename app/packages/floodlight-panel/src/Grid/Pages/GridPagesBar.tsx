/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The Grid's pagination bar in Pages mode: page controls over the view's
 * sample count, and PageUp/PageDown while the grid is focused.
 */

import * as fos from "@fiftyone/state";
import { SelectAnchor } from "@voxel51/voodo";
import React, { type RefObject, Suspense, useRef } from "react";
import { PAGE_SIZES, pageCount, pageForKey } from "./model";
import { PaginationBar } from "./PaginationBar";
import styles from "./Pages.module.css";
import type { GridPages } from "./useGridPages";
import usePageKeys from "./usePageKeys";

type Props = { grid: RefObject<HTMLElement>; pages: GridPages };

const Controls = ({
  bar,
  grid,
  pages,
}: Props & { bar: RefObject<HTMLElement> }) => {
  const total = fos.useGridSampleCount();
  const modal = fos.useModalActive();

  usePageKeys({
    disabled: modal,
    regions: [grid, bar],
    handle: (key) => {
      const next = pageForKey(
        key,
        pages.page,
        pageCount(total, pages.pageSize),
      );
      if (next === undefined) return false;
      next !== pages.page && pages.go(next);
      return true;
    },
  });

  return (
    <PaginationBar
      page={pages.page}
      pageSize={pages.pageSize}
      total={total}
      onChange={pages.go}
      pageButtons
      pageInput
      pageSizeOptions={PAGE_SIZES}
      onPageSizeChange={pages.resize}
      pageSizeAnchor={SelectAnchor.TopStart}
      pageSizePortal
    />
  );
};

// counting suspends; the boundary keeps that from hiding the grid
const GridPagesBar = ({ grid, pages }: Props) => {
  const bar = useRef<HTMLDivElement>(null);

  return (
    <div ref={bar} className={styles.footer} data-cy="fo-grid-pages">
      <Suspense fallback={null}>
        <Controls bar={bar} grid={grid} pages={pages} />
      </Suspense>
    </div>
  );
};

export default React.memo(GridPagesBar);
