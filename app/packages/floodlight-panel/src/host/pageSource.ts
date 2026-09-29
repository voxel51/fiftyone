/**
 * Page results that outlive Floodlight instances, so a rebuild reads the
 * pages it needs from memory instead of refetching them.
 */
export interface PageSource<K, P> {
  /** Resolves the page for `key`, fetching it at most once. */
  get(key: K): Promise<P>;
  /** Whether any fetch is in flight. */
  readonly fetching: boolean;
  /** Calls `listener` whenever `fetching` changes. */
  subscribe(listener: () => void): () => void;
  /** Drops cached pages whose key passes `keys` (all when omitted). */
  invalidate(keys?: (key: K) => boolean): void;
  /**
   * Item ids an invalidated page held that no refetched page holds, since
   * the last call. Only a source created with `ids` tracks them.
   */
  takeRemoved(): Set<string>;
}

export const createPageSource = <K, P>(
  fetch: (key: K) => Promise<P>,
  { ids }: { ids?: (page: P) => Iterable<string> } = {},
): PageSource<K, P> => {
  const pages = new Map<K, Promise<P>>();
  // the pages an invalidation dropped, compared with their refetches
  const stale = new Map<K, Promise<P>>();
  const before = new Set<string>();
  const after = new Set<string>();
  const listeners = new Set<() => void>();
  let inFlight = 0;

  const setInFlight = (next: number) => {
    const changed = inFlight > 0 !== next > 0;
    inFlight = next;
    changed && listeners.forEach((listener) => listener());
  };

  const compare = (previous: Promise<P>, page: Promise<P>) => {
    if (!ids) return;
    Promise.all([previous, page])
      .then(([old, next]) => {
        for (const id of ids(old)) before.add(id);
        for (const id of ids(next)) after.add(id);
      })
      .catch(() => undefined);
  };

  return {
    get(key) {
      const cached = pages.get(key);
      if (cached) return cached;

      setInFlight(inFlight + 1);
      const page = fetch(key).finally(() => setInFlight(inFlight - 1));
      pages.set(key, page);
      const previous = stale.get(key);
      if (previous) {
        stale.delete(key);
        compare(previous, page);
      }
      // a failed page is refetched next time instead of replaying the error
      page.catch(() => pages.get(key) === page && pages.delete(key));
      return page;
    },
    get fetching() {
      return inFlight > 0;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    invalidate(keys) {
      for (const [key, page] of [...pages]) {
        if (keys && !keys(key)) continue;
        pages.delete(key);
        // an earlier invalidation's page is the one the grid showed
        !stale.has(key) && stale.set(key, page);
      }
    },
    takeRemoved() {
      const removed = new Set<string>();
      for (const id of before) !after.has(id) && removed.add(id);
      before.clear();
      after.clear();
      return removed;
    },
  };
};
