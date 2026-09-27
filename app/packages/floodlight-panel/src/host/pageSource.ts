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
}

export const createPageSource = <K, P>(
  fetch: (key: K) => Promise<P>,
): PageSource<K, P> => {
  const pages = new Map<K, Promise<P>>();
  const listeners = new Set<() => void>();
  let inFlight = 0;

  const setInFlight = (next: number) => {
    const changed = inFlight > 0 !== next > 0;
    inFlight = next;
    changed && listeners.forEach((listener) => listener());
  };

  return {
    get(key) {
      const cached = pages.get(key);
      if (cached) return cached;

      setInFlight(inFlight + 1);
      const page = fetch(key).finally(() => setInFlight(inFlight - 1));
      pages.set(key, page);
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
  };
};
