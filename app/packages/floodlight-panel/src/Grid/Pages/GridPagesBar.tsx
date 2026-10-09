/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The Grid's pagination bar in Pages mode: page controls over a SMALL
 * order's total, and PageUp/PageDown while the grid is focused.
 */

import { useModalActive } from "@fiftyone/state";
import { SelectAnchor } from "@voxel51/voodo";
import React, { type RefObject, useRef } from "react";
import { PAGE_SIZES, pageCount, pageForKey } from "./model";
import { PaginationBar } from "./PaginationBar";
import styles from "./Pages.module.css";
import type { GridPages } from "./useGridPages";
import usePageKeys from "./usePageKeys";

type Props = {
  grid: RefObject<HTMLElement>;
  pages: GridPages;
  total: number;
};

const Controls = ({
  bar,
  grid,
  pages,
  total,
}: Props & { bar: RefObject<HTMLElement> }) => {
  const modal = useModalActive();

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

const GridPagesBar = ({ grid, pages, total }: Props) => {
  const bar = useRef<HTMLDivElement>(null);

  return (
    <div ref={bar} className={styles.footer} data-cy="fo-grid-pages">
      <Controls bar={bar} grid={grid} pages={pages} total={total} />
    </div>
  );
};

export default React.memo(GridPagesBar);
