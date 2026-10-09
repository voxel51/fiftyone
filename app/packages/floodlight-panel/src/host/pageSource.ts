/**
 * Page results that outlive Floodlight instances, so a rebuild reads the
 * pages it needs from memory instead of refetching them. Memory and work in
 * flight are bounded: at most `capacity` pages no instance holds are kept
 * (least recently used first out), and at most `concurrency` fetches run.
 *
 * A warm fetches a page before anything reads it, at low priority: it runs
 * only while two slots are free, a read that finds no free slot aborts it,
 * and it is the first page evicted until something reads it. At most
 * {@link MAX_WARMING} warms run and {@link MAX_WARMED} wait unread.
 */

export interface PageReader<K, P> {
  /** Resolves the page for `key`, fetching it at most once. */
  get(key: K): Promise<P>;
  /** The page for `key` if it has resolved, for a synchronous layout. */
  peek(key: K): P | undefined;
}

/**
 * One instance's reads. The pages it reads stay in memory until `release`,
 * which also drops (queued) or aborts (in flight) any fetch only it waits on;
 * a released lease's pending reads never settle.
 */
export interface Lease<K, P> extends PageReader<K, P> {
  release(): void;
  /** Pages it holds. */
  readonly size: number;
}

export interface PageSource<K, P> extends PageReader<K, P> {
  /**
   * A new lease. Given `from`, it also waits on what `from` is still
   * fetching, so an instance replacing another at the same place keeps that
   * work when the other is released.
   */
  lease(from?: Lease<K, P>): Lease<K, P>;
  /** Whether any fetch is queued or in flight. */
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
  /** Resolved pages in memory. */
  readonly size: number;
  /** Fetches running now. */
  readonly active: number;
  /**
   * Fetches `key` ahead of a read, when a slot is spare and the warm bounds
   * allow; otherwise does nothing. A read promotes it to a normal page.
   */
  warm(key: K): void;
  /** Aborts every warm in flight; reads are served as before. */
  dispose(): void;
}

export interface PageSourceOptions<K, P> {
  /** Resolved pages kept beyond those a live lease holds. */
  capacity?: number;
  /** Fetches allowed to run at once; the rest queue. */
  concurrency?: number;
  ids?: (page: P) => Iterable<string>;
  /** Called with each page dropped to stay within `capacity`. */
  onEvict?: (key: K, page: P) => void;
}

/**
 * Items in one grid fetch page. One request covers the first screen at the
 * default zoom with a screen of scroll-ahead (about 40 items on common
 * displays), or a dense screen at the minimum zoom on a laptop. It is a
 * constant: sequences, offsets and Pages-mode ranges divide by it.
 */
export const PAGE_SIZE = 50;

/**
 * Items kept beyond whatever the live instances hold: a few screens left
 * behind plus the places a jump left.
 */
export const CACHED_ITEMS = 800;

export const PAGE_CAPACITY = CACHED_ITEMS / PAGE_SIZE;

/**
 * An instance keeps at most one fetch in flight per direction, and at most
 * two instances (the visible one and the one building) are live: anything
 * beyond four belongs to a superseded instance.
 */
export const MAX_FETCHES = 4;

/** Warms in flight at once. */
export const MAX_WARMING = 1;

/** Resolved warms kept unread; an older one is dropped for a newer. */
export const MAX_WARMED = 2;

type State = "queued" | "fetching" | "done" | "dropped";

interface Entry<K, P> {
  key: K;
  promise: Promise<P>;
  resolve: (value: P) => void;
  reject: (error: unknown) => void;
  state: State;
  value?: P;
  /** Leases that read it: they wait on it, then pin it. */
  holders: Set<object>;
  /** An unleased read waits on it, so it is never cancelled. */
  kept: boolean;
  /** Fetched ahead and not read yet: first to abort and to evict. */
  warm: boolean;
  controller: AbortController;
  used: number;
}

const never = <P>() => new Promise<P>(() => undefined);

export const createPageSource = <K, P>(
  fetch: (key: K, signal: AbortSignal) => Promise<P>,
  {
    capacity = PAGE_CAPACITY,
    concurrency = MAX_FETCHES,
    ids,
    onEvict,
  }: PageSourceOptions<K, P> = {},
): PageSource<K, P> => {
  const entries = new Map<K, Entry<K, P>>();
  const queue: Entry<K, P>[] = [];
  // the pages an invalidation dropped, compared with their refetches
  const stale = new Map<K, Promise<P>>();
  const before = new Set<string>();
  const after = new Set<string>();
  const listeners = new Set<() => void>();
  let active = 0;
  let pending = 0;
  let clock = 0;
  const helds = new WeakMap<Lease<K, P>, Set<Entry<K, P>>>();

  const setPending = (next: number) => {
    const changed = pending > 0 !== next > 0;
    pending = next;
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

  const trim = () => {
    const loose = [...entries.values()]
      .filter((entry) => entry.state === "done" && !entry.holders.size)
      // unread warms first, then least recently used
      .sort((a, b) => Number(b.warm) - Number(a.warm) || a.used - b.used);
    for (const entry of loose.slice(0, Math.max(0, loose.length - capacity))) {
      entries.delete(entry.key);
      onEvict?.(entry.key, entry.value as P);
    }
  };

  const settle = (entry: Entry<K, P>, state: State, refill = true) => {
    if (entry.state === "fetching") active--;
    else queue.splice(queue.indexOf(entry), 1);
    entry.state = state;
    entry.warm || setPending(pending - 1);
    refill && pump();
  };

  const start = (entry: Entry<K, P>) => {
    entry.state = "fetching";
    active++;
    let request: Promise<P>;
    try {
      request = fetch(entry.key, entry.controller.signal);
    } catch (error) {
      request = Promise.reject(error);
    }
    request.then(
      (value) => {
        if (entry.state !== "fetching") return;
        entry.value = value;
        entry.used = ++clock;
        settle(entry, "done");
        entry.resolve(value);
        entry.warm && dropWarmed();
        trim();
      },
      (error) => {
        if (entry.state !== "fetching") return;
        settle(entry, "dropped");
        // a failed page is refetched next time instead of replaying the error
        entries.get(entry.key) === entry && entries.delete(entry.key);
        entry.reject(error);
      },
    );
  };

  function pump() {
    while (active < concurrency && queue.length) start(queue.shift()!);
  }

  /** Refills nothing: the caller pumps once every cancel is done. */
  const cancel = (entry: Entry<K, P>) => {
    if (entry.state !== "queued" && entry.state !== "fetching") return;
    entry.controller.abort();
    settle(entry, "dropped", false);
    entries.get(entry.key) === entry && entries.delete(entry.key);
  };

  /** A read makes a warm a normal page, which the pending state counts. */
  const promote = (entry: Entry<K, P>) => {
    if (!entry.warm) return;
    entry.warm = false;
    entry.state === "fetching" && setPending(pending + 1);
  };

  const warms = (state: State) =>
    [...entries.values()].filter(
      (entry) => entry.warm && entry.state === state,
    );

  /** Aborts warms in flight. Refills nothing, like {@link cancel}. */
  const cool = () => warms("fetching").forEach(cancel);

  /** Keeps the newest {@link MAX_WARMED} resolved warms nothing has read. */
  const dropWarmed = () => {
    const warmed = warms("done").sort((a, b) => a.used - b.used);
    for (const entry of warmed.slice(0, -MAX_WARMED)) {
      entries.delete(entry.key);
      onEvict?.(entry.key, entry.value as P);
    }
  };

  const create = (key: K, warm: boolean) => {
    let resolve!: (value: P) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<P>((a, b) => {
      resolve = a;
      reject = b;
    });
    promise.catch(() => undefined);
    const entry: Entry<K, P> = {
      controller: new AbortController(),
      holders: new Set(),
      kept: false,
      key,
      promise,
      reject,
      resolve,
      state: "queued",
      used: ++clock,
      warm,
    };
    entries.set(key, entry);
    const previous = stale.get(key);
    if (previous) {
      stale.delete(key);
      compare(previous, promise);
    }
    return entry;
  };

  /** A leased read that would wait for a slot takes a warm's instead. */
  const obtain = (key: K, leased = false) => {
    const cached = entries.get(key);
    if (cached) {
      cached.used = ++clock;
      promote(cached);
      return cached;
    }

    if (leased && active >= concurrency) cool();
    const entry = create(key, false);
    setPending(pending + 1);
    queue.push(entry);
    pump();
    return entry;
  };

  const read = (entry: Entry<K, P>) =>
    entry.state === "done" ? Promise.resolve(entry.value as P) : entry.promise;

  const peek = (key: K) => {
    const entry = entries.get(key);
    if (entry?.state !== "done") return undefined;
    entry.used = ++clock;
    return entry;
  };

  return {
    get(key) {
      const entry = obtain(key);
      entry.kept = true;
      return read(entry);
    },
    peek: (key) => peek(key)?.value,
    lease(from) {
      const held = new Set<Entry<K, P>>();
      let released = false;
      const lease: Lease<K, P> = {
        get(key) {
          if (released) return never();
          const entry = obtain(key, true);
          entry.holders.add(lease);
          held.add(entry);
          if (entry.state === "done") return Promise.resolve(entry.value as P);
          return new Promise<P>((resolve, reject) =>
            entry.promise.then(
              (value) => !released && resolve(value),
              (error) => !released && reject(error),
            ),
          );
        },
        peek(key) {
          const entry = released ? undefined : peek(key);
          if (!entry) return undefined;
          promote(entry);
          entry.holders.add(lease);
          held.add(entry);
          return entry.value;
        },
        release() {
          if (released) return;
          released = true;
          for (const entry of held) {
            entry.holders.delete(lease);
            entry.holders.size || entry.kept || cancel(entry);
          }
          held.clear();
          pump();
          trim();
        },
        get size() {
          return held.size;
        },
      };
      helds.set(lease, held);
      for (const entry of (from && helds.get(from)) ?? []) {
        if (entry.state !== "queued" && entry.state !== "fetching") continue;
        entry.holders.add(lease);
        held.add(entry);
      }
      return lease;
    },
    get fetching() {
      return pending > 0;
    },
    get size() {
      let size = 0;
      for (const entry of entries.values()) entry.state === "done" && size++;
      return size;
    },
    get active() {
      return active;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    warm(key) {
      if (entries.has(key) || active >= concurrency - 1) return;
      if (warms("fetching").length >= MAX_WARMING) return;
      start(create(key, true));
    },
    dispose() {
      cool();
      pump();
    },
    invalidate(keys) {
      for (const [key, entry] of [...entries]) {
        if (keys && !keys(key)) continue;
        if (entry.warm) {
          // never shown, so nothing compares against it
          cancel(entry);
          entries.delete(key);
          continue;
        }
        entries.delete(key);
        // an earlier invalidation's page is the one the grid showed
        !stale.has(key) && stale.set(key, entry.promise);
      }
      for (const key of stale.keys()) {
        if (stale.size <= 4 * capacity) break;
        stale.delete(key);
      }
      pump();
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
