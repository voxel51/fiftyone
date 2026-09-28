/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import type { Anchor } from "../../host/createHost";
import type { PageSource } from "../../host/pageSource";
import styles from "./Pages.module.css";
import { createBoundedSource } from "./boundedSource";
import {
  inRange,
  keyRange,
  type KeyRange,
  pageAfterResize,
  pageOfKey,
} from "./model";
import usePagingSettings, { usePagesEnabled } from "./settings";

/** What paging needs from the instance host. */
export interface PagesHost {
  rebuild(anchor?: Anchor<number>): void;
}

export interface GridPages {
  /** Pages mode is on for this panel and layout. */
  enabled: boolean;
  /** Zero-based UI page on screen. */
  page: number;
  pageSize: number;
  /** Rebuilds the grid at the top of `page`. */
  go: (page: number) => void;
  /** Changes the page size, keeping the current page's first item on screen. */
  resize: (size: number) => void;
}

/**
 * Pages mode for the Grid: each UI page is its own instance, built through
 * the host with a source bounded to that page's fetch pages. Every grid
 * rebuild passes its anchor through {@link anchor}, so the UI page follows
 * it and a reset anchor (key 0) returns to page 1.
 */
export default function useGridPages<
  P extends { items: unknown[]; next: number | null; previous: number | null },
>({
  fetchSize,
  host,
  layout,
  source,
}: {
  fetchSize: number;
  host?: PagesHost;
  layout: "grid" | "groups" | "strip";
  source: PageSource<number, P>;
}) {
  const { pageSize, setPageSize } = usePagingSettings();
  const enabled = usePagesEnabled(layout);
  const [page, setPage] = useState(0);

  const latest = useRef({ enabled, page, pageSize });
  latest.current.enabled = enabled;
  latest.current.pageSize = pageSize;
  const range = useRef<KeyRange>(keyRange(0, pageSize, fetchSize));
  const bounded = useMemo(
    () => createBoundedSource(source, () => range.current),
    [source],
  );

  const show = useCallback(
    (next: number, size: number) => {
      range.current = keyRange(next, size, fetchSize);
      latest.current.page = next;
      setPage(next);
      return range.current[0];
    },
    [fetchSize],
  );

  const anchor = useCallback(
    (start: Anchor<number>): Anchor<number> => {
      const { enabled, pageSize } = latest.current;
      if (!enabled) return start;
      const first = show(pageOfKey(start.key, pageSize, fetchSize), pageSize);
      // a scrub cursor's negative keys have no UI page
      return inRange(start.key, range.current) ? start : { key: first };
    },
    [fetchSize, show],
  );

  const go = useCallback(
    (next: number) =>
      host?.rebuild({ key: show(next, latest.current.pageSize) }),
    [host, show],
  );

  const resize = useCallback(
    (size: number) => {
      const { page, pageSize } = latest.current;
      latest.current.pageSize = size;
      setPageSize(size);
      host?.rebuild({ key: show(pageAfterResize(page, pageSize, size), size) });
    },
    [host, setPageSize, show],
  );

  const pages: GridPages = useMemo(
    () => ({ enabled, go, page, pageSize, resize }),
    [enabled, go, page, pageSize, resize],
  );

  return {
    anchor,
    className: enabled ? styles.paged : undefined,
    pages,
    source: enabled ? bounded : source,
  };
}
