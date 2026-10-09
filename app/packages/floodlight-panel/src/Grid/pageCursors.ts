/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Cursor pagination's page boundaries. Spotlight only knows page numbers;
 * the server seeks from a neighbor's boundary sort value, so page N is
 * fetched after page N-1's end or before page N+1's start, whichever is
 * still known.
 */

export interface PageCursors {
  /** Last sample's sort value per page. */
  ends: Map<number, string>;
  /** First sample's sort value per page. */
  starts: Map<number, string>;
}

export const createPageCursors = (): PageCursors => ({
  ends: new Map(),
  starts: new Map(),
});

export const forgetCursors = (cursors: PageCursors, page: number) => {
  cursors.ends.delete(page);
  cursors.starts.delete(page);
};

export type Seek = { after: string } | { before: string } | undefined;

/**
 * How cursor-mode page `page` seeks: forward pages prefer the previous
 * page's end and negative pages the next page's start, each falling back to
 * the other neighbor when its page was dropped. Page 0 is the committed
 * cursor itself.
 */
export const seekFor = (cursors: PageCursors, page: number): Seek => {
  if (page === 0) return undefined;
  const end = cursors.ends.get(page - 1);
  const start = cursors.starts.get(page + 1);
  const after = end === undefined ? undefined : { after: end };
  const before = start === undefined ? undefined : { before: start };
  return page > 0 ? (after ?? before) : (before ?? after);
};

/**
 * The page's links. A backward seek came from page + 1, so that page exists;
 * the server reports only the earlier side. A forward seek past page - 1
 * knows that page exists.
 */
export const cursorLinks = ({
  hasNext,
  hasPrevious,
  originHasPrevious,
  page,
  seek,
}: {
  hasNext: boolean;
  hasPrevious: boolean;
  originHasPrevious: boolean;
  page: number;
  seek: Seek;
}) => {
  if (seek && "before" in seek) {
    return { next: page + 1, previous: hasPrevious ? page - 1 : null };
  }
  const previous =
    page === 0 ? originHasPrevious : page > 0 || seek !== undefined;
  return {
    next: hasNext ? page + 1 : null,
    previous: previous ? page - 1 : null,
  };
};
