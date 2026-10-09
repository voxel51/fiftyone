/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Pure page math for the Grid's Pages mode. A UI page of `size` items spans
 * `size / fetchSize` consecutive fetch pages, so its keys are contiguous.
 */

export type Paging = "scroll" | "pages";

/** UI page sizes; each is a multiple of the 20-item fetch page. */
export const PAGE_SIZES = [20, 40, 100, 200];

export const DEFAULT_PAGE_SIZE = 40;

/** A half-open range of fetch page keys, `[start, end)`. */
export type KeyRange = readonly [start: number, end: number];

/** Snaps a stored size to a listed one, so the fetch-page math stays whole. */
export const normalizeSize = (size?: number): number =>
  size !== undefined && PAGE_SIZES.includes(size) ? size : DEFAULT_PAGE_SIZE;

/** Pages needed for `total` items; an empty view still shows one page. */
export const pageCount = (total: number, size: number): number =>
  Math.max(1, Math.ceil(Math.max(0, total) / size));

export const clampPage = (page: number, count: number): number =>
  Math.max(0, Math.min(Math.floor(page), count - 1));

/** The fetch page keys UI page `page` serves. */
export const keyRange = (
  page: number,
  size: number,
  fetchSize: number,
): KeyRange => {
  const span = size / fetchSize;
  return [page * span, (page + 1) * span];
};

/** The UI page holding fetch page `key`; a reset anchor (key 0) is page 0. */
export const pageOfKey = (
  key: number,
  size: number,
  fetchSize: number,
): number => Math.max(0, Math.floor((key * fetchSize) / size));

/** The page that keeps the old page's first item on screen at a new size. */
export const pageAfterResize = (
  page: number,
  from: number,
  to: number,
): number => Math.floor((page * from) / to);

export const inRange = (key: number, [start, end]: KeyRange): boolean =>
  key >= start && key < end;

/** The page a key press moves to, or `undefined` for other keys. */
export const pageForKey = (
  key: string,
  page: number,
  count: number,
): number | undefined => {
  if (key === "PageDown") return clampPage(page + 1, count);
  if (key === "PageUp") return clampPage(page - 1, count);
  return undefined;
};
