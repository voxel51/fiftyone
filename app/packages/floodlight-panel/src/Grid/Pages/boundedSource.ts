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
): PageSource<number, P> => ({
  get: async (key) => {
    const bounds = range();
    if (!inRange(key, bounds)) {
      return { items: [], next: null, previous: null } as unknown as P;
    }

    const page = await source.get(key);
    // a copy: the cached page is shared with instances on other ranges
    return {
      ...page,
      next: key + 1 < bounds[1] ? page.next : null,
      previous: key > bounds[0] ? page.previous : null,
    };
  },
  get fetching() {
    return source.fetching;
  },
  subscribe: (listener) => source.subscribe(listener),
});
