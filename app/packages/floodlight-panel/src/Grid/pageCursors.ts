/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * How a page key is fetched from a server order. Floodlight only knows page
 * numbers; key 0 is the seek page (the start of the order without a seek),
 * key n > 0 follows the end cursor of key n - 1, and key n < 0 precedes the
 * start cursor of key n + 1. A SMALL order may also address any key by its
 * offset, so jumps there never need a new origin.
 */

import { BoundedMap } from "../host/bounded";

export type OrderMode = "SMALL" | "INDEXED" | "SCROLL";

export interface OrderSeek {
  offset?: number;
  fraction?: number;
  value?: unknown;
}

export interface PageCursors {
  /** First sample's cursor per page. */
  starts: Map<number, string>;
  /** Last sample's cursor per page. */
  ends: Map<number, string>;
}

/**
 * Pages whose boundaries are kept. They outlive their pages, so an evicted
 * or invalidated page is fetched again from a neighbor's boundary.
 */
export const MAX_CURSOR_PAGES = 1024;

export const createPageCursors = (): PageCursors => ({
  ends: new BoundedMap(MAX_CURSOR_PAGES),
  starts: new BoundedMap(MAX_CURSOR_PAGES),
});

export type PageRequest =
  | { after: string | null }
  | { before: string }
  | { seek: OrderSeek };

/**
 * The request for page `key`, or undefined when nothing addresses it (a
 * page before the start, or one whose neighbors were never fetched).
 */
export const pageRequest = ({
  cursors,
  key,
  mode,
  pageSize,
  seek,
}: {
  cursors: PageCursors;
  key: number;
  mode: OrderMode;
  pageSize: number;
  /** The origin's seek; only an INDEXED or SMALL order has one. */
  seek?: OrderSeek;
}): PageRequest | undefined => {
  if (key === 0) {
    return seek && mode !== "SCROLL" ? { seek } : { after: null };
  }

  const end = cursors.ends.get(key - 1);
  const start = cursors.starts.get(key + 1);
  const after = end === undefined ? undefined : { after: end };
  const before = start === undefined ? undefined : { before: start };
  if (key < 0) {
    return mode === "INDEXED" && seek ? (before ?? after) : undefined;
  }

  const known = after ?? before;
  if (known || mode !== "SMALL" || seek) return known;
  return { seek: { offset: key * pageSize } };
};

/** The keys either side of a fetched page. */
export const pageLinks = (
  key: number,
  request: PageRequest,
  { hasNext, hasPrevious }: { hasNext: boolean; hasPrevious: boolean },
) => {
  if ("before" in request) {
    return { next: key + 1, previous: hasPrevious ? key - 1 : null };
  }

  const previous = "seek" in request ? hasPrevious : request.after !== null;
  return {
    next: hasNext ? key + 1 : null,
    previous: previous ? key - 1 : null,
  };
};

/**
 * The sequence number of each item on a page: consecutive across pages,
 * so a range of items between two samples is known. A backward page ends
 * where the page after it starts.
 */
export const pageSequence = (
  key: number,
  request: PageRequest,
  pageSize: number,
  length: number,
) => {
  const first =
    "before" in request ? (key + 1) * pageSize - length : key * pageSize;
  return (index: number) => first + index;
};

export const rememberCursors = (
  cursors: PageCursors,
  key: number,
  {
    endCursor,
    startCursor,
  }: { endCursor?: string | null; startCursor?: string | null },
) => {
  startCursor && cursors.starts.set(key, startCursor);
  endCursor && cursors.ends.set(key, endCursor);
};

/**
 * The skip window of page `page`: `count` is the page size variable
 * `paginateSamplesQuery` declares, so a page holds `pageSize` samples.
 */
export const pageWindow = (page: number, pageSize: number) => ({
  after: page ? String(page * pageSize - 1) : null,
  count: pageSize,
});

/** Request variables for `samples` from a page request. */
export const requestVariables = (request: PageRequest) => ({
  after: "after" in request ? request.after : null,
  before: "before" in request ? request.before : null,
  seek: "seek" in request ? request.seek : null,
});
