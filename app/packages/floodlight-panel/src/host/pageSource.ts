/**
 * Page results that outlive Floodlight instances, so a rebuild reads the
 * pages it needs from memory instead of refetching them. Memory and work in
 * flight are bounded: at most `capacity` pages no instance holds are kept
 * (least recently used first out), and at most `concurrency` fetches run.
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
 * Two 20-item fetch pages fill a dense viewport, so 40 pages (800 samples)
 * hold a few viewports left behind plus the places a jump left, on top of
 * whatever the live instances hold.
 */
export const PAGE_CAPACITY = 40;

/**
 * An instance keeps at most one fetch in flight per direction, and at most
 * two instances (the visible one and the one building) are live: anything
 * beyond four belongs to a superseded instance.
 */
export const MAX_FETCHES = 4;

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
      .sort((a, b) => a.used - b.used);
    for (const entry of loose.slice(0, Math.max(0, loose.length - capacity))) {
      entries.delete(entry.key);
      onEvict?.(entry.key, entry.value as P);
    }
  };

  const settle = (entry: Entry<K, P>, state: State, refill = true) => {
    if (entry.state === "fetching") active--;
    else queue.splice(queue.indexOf(entry), 1);
    entry.state = state;
    setPending(pending - 1);
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

  const obtain = (key: K) => {
    const cached = entries.get(key);
    if (cached) {
      cached.used = ++clock;
      return cached;
    }

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
    };
    entries.set(key, entry);
    const previous = stale.get(key);
    if (previous) {
      stale.delete(key);
      compare(previous, promise);
    }
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
          const entry = obtain(key);
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
    invalidate(keys) {
      for (const [key, entry] of [...entries]) {
        if (keys && !keys(key)) continue;
        entries.delete(key);
        // an earlier invalidation's page is the one the grid showed
        !stale.has(key) && stale.set(key, entry.promise);
      }
      for (const key of stale.keys()) {
        if (stale.size <= 4 * capacity) break;
        stale.delete(key);
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
