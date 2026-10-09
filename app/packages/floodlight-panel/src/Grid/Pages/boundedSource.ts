/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { PageSource } from "../../host/pageSource";
import { inRange, type KeyRange } from "./model";

interface Linked {
  items: unknown[];
  next: number | null;
  previous: number | null;
}

/**
 * Serves only the fetch pages in `range()`, ending the chain at its edges so
 * an instance never scrolls past its UI page. Delegates to `source`, so pages
 * fetched for any earlier instance come from memory.
 */
export const createBoundedSource = <P extends Linked>(
  source: PageSource<number, P>,
  range: () => KeyRange,
): PageSource<number, P> => {
  const empty = () =>
    ({ items: [], next: null, previous: null }) as unknown as P;
  // a copy: the cached page is shared with instances on other ranges
  const clip = (key: number, page: P, bounds: KeyRange): P => ({
    ...page,
    next: key + 1 < bounds[1] ? page.next : null,
    previous: key > bounds[0] ? page.previous : null,
  });

  return {
    get: async (key) => {
      const bounds = range();
      if (!inRange(key, bounds)) return empty();
      return clip(key, await source.get(key), bounds);
    },
    peek: (key) => {
      const bounds = range();
      if (!inRange(key, bounds)) return empty();
      const page = source.peek(key);
      return page && clip(key, page, bounds);
    },
    get fetching() {
      return source.fetching;
    },
    invalidate: (keys) => source.invalidate(keys),
    takeRemoved: () => source.takeRemoved(),
    subscribe: (listener) => source.subscribe(listener),
  };
};
