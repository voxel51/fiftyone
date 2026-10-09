/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { Lease, PageReader, PageSource } from "../../host/pageSource";
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

  const reader = (inner: PageReader<number, P>): PageReader<number, P> => ({
    get: async (key) => {
      const bounds = range();
      if (!inRange(key, bounds)) return empty();
      return clip(key, await inner.get(key), bounds);
    },
    peek: (key) => {
      const bounds = range();
      if (!inRange(key, bounds)) return empty();
      const page = inner.peek(key);
      return page && clip(key, page, bounds);
    },
  });

  const inners = new WeakMap<Lease<number, P>, Lease<number, P>>();

  return {
    ...reader(source),
    lease: (from) => {
      const inner = source.lease(from && inners.get(from));
      const lease: Lease<number, P> = {
        ...reader(inner),
        release: () => inner.release(),
        get size() {
          return inner.size;
        },
      };
      inners.set(lease, inner);
      return lease;
    },
    get fetching() {
      return source.fetching;
    },
    get size() {
      return source.size;
    },
    get active() {
      return source.active;
    },
    invalidate: (keys) => source.invalidate(keys),
    takeRemoved: () => source.takeRemoved(),
    subscribe: (listener) => source.subscribe(listener),
  };
};
