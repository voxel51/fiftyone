/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/** A page of results, and the keys of the pages either side of it. */
export interface SamplePage<K, T> {
  items: T[];
  next: K | null;
  previous: K | null;
}

/** Where a sample is: its page, and its index in that page. */
export interface SamplePosition<K> {
  key: K;
  index: number;
}

/**
 * Steps between samples over pages, with no grid: crossing a page boundary
 * fetches the page, and nothing is laid out. Whatever serves the pages (a
 * grid's pager today, a shared source later) can back it.
 */
export interface SampleNavigator<T> {
  /** Moves `offset` samples; resolves with the sample there, or undefined. */
  step(offset: number): Promise<T | undefined>;
  /** The sample `offset` away, without moving. */
  peek(offset: number): Promise<T | undefined>;
}

export const createSampleNavigator = <K, T>({
  at,
  get,
}: {
  at: SamplePosition<K>;
  get: (key: K) => Promise<SamplePage<K, T>>;
}): SampleNavigator<T> => {
  const pages = new Map<K, Promise<SamplePage<K, T>>>();
  const load = (key: K) => {
    let page = pages.get(key);
    if (!page) {
      page = get(key);
      pages.set(key, page);
      // a failed page is fetched again next time
      page.catch(() => pages.get(key) === page && pages.delete(key));
    }
    return page;
  };

  let current = at;

  const walk = async (
    offset: number,
  ): Promise<(SamplePosition<K> & { item: T }) | undefined> => {
    let { key } = current;
    let page = await load(key);
    let index = current.index + offset;
    while (index >= page.items.length) {
      if (page.next === null) return undefined;
      index -= page.items.length;
      key = page.next;
      page = await load(key);
    }
    while (index < 0) {
      if (page.previous === null) return undefined;
      key = page.previous;
      page = await load(key);
      index += page.items.length;
    }
    return { key, index, item: page.items[index] };
  };

  return {
    async step(offset) {
      const found = await walk(offset);
      if (!found) return undefined;
      current = { key: found.key, index: found.index };
      return found.item;
    },

    async peek(offset) {
      return (await walk(offset))?.item;
    },
  };
};
