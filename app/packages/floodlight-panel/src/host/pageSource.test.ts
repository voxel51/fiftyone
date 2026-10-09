import { describe, expect, test, vi } from "vitest";
import {
  CACHED_ITEMS,
  createPageSource,
  MAX_WARMED,
  PAGE_CAPACITY,
  PAGE_SIZE,
} from "./pageSource";

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, reject, resolve };
};

describe("createPageSource", () => {
  test("peeks a page only once it has resolved, until it is invalidated", async () => {
    const page = deferred<string>();
    const source = createPageSource(() => page.promise);

    const pending = source.get(0);
    expect(source.peek(0)).toBeUndefined();

    page.resolve("page");
    await pending;
    expect(source.peek(0)).toBe("page");

    source.invalidate();
    expect(source.peek(0)).toBeUndefined();
  });

  test("never peeks a failed page", async () => {
    const source = createPageSource(() => Promise.reject(new Error("down")));

    await source.get(0).catch(() => undefined);
    expect(source.peek(0)).toBeUndefined();
  });

  test("serves a fetched page from memory", async () => {
    const fetch = vi.fn(async (key: number) => ({ key }));
    const source = createPageSource(fetch);

    const first = await source.get(1);
    const second = await source.get(1);

    expect(second).toBe(first);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test("shares one fetch between concurrent requests", async () => {
    const page = deferred<string>();
    const fetch = vi.fn(() => page.promise);
    const source = createPageSource(fetch);

    const a = source.get(0);
    const b = source.get(0);
    page.resolve("page");

    expect(await a).toBe("page");
    expect(await b).toBe("page");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test("refetches a page whose fetch failed", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce("page");
    const source = createPageSource<number, string>(fetch);

    await expect(source.get(0)).rejects.toThrow("timeout");
    await expect(source.get(0)).resolves.toBe("page");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test("reports whether a fetch is in flight", async () => {
    const page = deferred<string>();
    const source = createPageSource(() => page.promise);
    const listener = vi.fn();
    source.subscribe(listener);

    expect(source.fetching).toBe(false);
    const pending = source.get(0);
    expect(source.fetching).toBe(true);
    page.resolve("page");
    await pending;

    expect(source.fetching).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  test("a memory hit does not report fetching", async () => {
    const source = createPageSource(async () => "page");
    await source.get(0);
    const listener = vi.fn();
    source.subscribe(listener);

    await source.get(0);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("invalidate", () => {
  const server = (pages: Record<number, string[]>) => {
    const fetch = vi.fn(async (key: number) => ({ ids: [...pages[key]] }));
    const source = createPageSource(fetch, { ids: (page) => page.ids });
    return { fetch, pages, source };
  };

  test("refetches the pages it drops and keeps the rest", async () => {
    const { fetch, source } = server({ 0: ["a"], 1: ["b"] });
    await source.get(0);
    await source.get(1);

    source.invalidate((key) => key === 0);
    await source.get(0);
    await source.get(1);

    expect(fetch.mock.calls.map(([key]) => key)).toEqual([0, 1, 0]);
  });

  test("drops every page when given no keys", async () => {
    const { fetch, source } = server({ 0: ["a"], 1: ["b"] });
    await source.get(0);
    await source.get(1);

    source.invalidate();
    await source.get(0);
    await source.get(1);

    expect(fetch).toHaveBeenCalledTimes(4);
  });

  test("reports an id no refetched page holds", async () => {
    const { pages, source } = server({ 0: ["a", "b", "c"] });
    await source.get(0);

    pages[0] = ["a", "c"];
    source.invalidate();
    await source.get(0);
    await Promise.resolve();

    expect([...source.takeRemoved()]).toEqual(["b"]);
    expect([...source.takeRemoved()]).toEqual([]);
  });

  test("does not report an id that only moved to another refetched page", async () => {
    const { pages, source } = server({ 0: ["a", "b"], 1: ["c", "d"] });
    await source.get(0);
    await source.get(1);

    // "a" deleted: skip paging shifts "c" onto page 0
    pages[0] = ["b", "c"];
    pages[1] = ["d"];
    source.invalidate();
    await source.get(0);
    await source.get(1);
    await Promise.resolve();

    expect([...source.takeRemoved()]).toEqual(["a"]);
  });

  test("reports nothing without an ids reader", async () => {
    let ids = ["a", "b"];
    const source = createPageSource(async () => ({ ids }));
    await source.get(0);

    ids = ["a"];
    source.invalidate();
    await source.get(0);
    await Promise.resolve();

    expect(source.takeRemoved().size).toBe(0);
  });
});

/** A fetch whose calls resolve only when told, recording each signal. */
const gated = () => {
  const calls: { key: number; signal: AbortSignal; resolve: () => void }[] = [];
  const fetch = vi.fn(
    (key: number, signal: AbortSignal) =>
      new Promise<{ key: number; ids: string[] }>((resolve) =>
        calls.push({
          key,
          signal,
          resolve: () => resolve({ key, ids: [`${key}`] }),
        }),
      ),
  );
  /** Resolves every call not aborted, until none is left. */
  const drain = async () => {
    for (let call = calls.find((c) => !c.signal.aborted); call; ) {
      calls.splice(calls.indexOf(call), 1);
      call.resolve();
      await Promise.resolve();
      await Promise.resolve();
      call = calls.find((c) => !c.signal.aborted);
    }
  };
  return { calls, drain, fetch };
};

describe("memory bound", () => {
  test("holds at most `capacity` pages no lease holds, refetching evicted ones", async () => {
    const fetch = vi.fn(async (key: number) => ({ key }));
    const onEvict = vi.fn();
    const source = createPageSource(fetch, { capacity: 8, onEvict });

    for (let key = 0; key < 500; key++) {
      await source.get(key);
      expect(source.size).toBeLessThanOrEqual(8);
    }

    expect(onEvict).toHaveBeenCalledTimes(492);
    expect(onEvict).toHaveBeenCalledWith(0, { key: 0 });
    expect(source.peek(0)).toBeUndefined();
    expect(source.peek(499)).toEqual({ key: 499 });
    await expect(source.get(0)).resolves.toEqual({ key: 0 });
    expect(fetch).toHaveBeenCalledTimes(501);
  });

  test("evicts the least recently read page first", async () => {
    const source = createPageSource(async (key: number) => key, {
      capacity: 2,
    });
    await source.get(0);
    await source.get(1);
    source.peek(0);
    await source.get(2);

    expect(source.peek(0)).toBe(0);
    expect(source.peek(1)).toBeUndefined();
  });

  test("a lease pins what it read until it is released", async () => {
    const source = createPageSource(async (key: number) => key, {
      capacity: 2,
    });
    const lease = source.lease();
    for (let key = 0; key < 10; key++) await lease.get(key);

    expect(source.size).toBe(10);
    expect(lease.size).toBe(10);
    expect(lease.peek(0)).toBe(0);

    lease.release();
    expect(source.size).toBe(2);
  });

  test("a peek through a lease pins the page", async () => {
    const source = createPageSource(async (key: number) => key, {
      capacity: 1,
    });
    await source.get(0);
    const lease = source.lease();
    expect(lease.peek(0)).toBe(0);
    for (let key = 1; key < 5; key++) await source.get(key);

    expect(source.peek(0)).toBe(0);
  });
});

describe("work in flight", () => {
  test("runs at most `concurrency` fetches, queueing the rest", async () => {
    const { calls, drain, fetch } = gated();
    const source = createPageSource(fetch, { concurrency: 4 });

    const pages = Array.from({ length: 30 }, (_, key) => source.get(key));
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(source.active).toBe(4);

    let most = 0;
    while (calls.length) {
      most = Math.max(most, source.active);
      await drain();
    }
    await Promise.all(pages);

    expect(most).toBe(4);
    expect(fetch).toHaveBeenCalledTimes(30);
    expect(source.fetching).toBe(false);
  });

  test("a released lease drops its queued fetches and aborts its running ones", async () => {
    const { calls, fetch } = gated();
    const source = createPageSource(fetch, { concurrency: 2 });
    const lease = source.lease();
    const settled = vi.fn();
    for (let key = 0; key < 6; key++) lease.get(key).then(settled, settled);

    lease.release();
    calls.forEach((call) => call.resolve());
    await Promise.resolve();
    await Promise.resolve();

    expect(fetch.mock.calls.map(([key]) => key)).toEqual([0, 1]);
    expect(calls.every((call) => call.signal.aborted)).toBe(true);
    expect(settled).not.toHaveBeenCalled();
    expect(source.size).toBe(0);
    expect(source.peek(0)).toBeUndefined();
    expect(source.active).toBe(0);
    expect(source.fetching).toBe(false);
  });

  test("a fetch another reader waits on survives a release", async () => {
    const { calls, fetch } = gated();
    const source = createPageSource(fetch);
    const leaving = source.lease();
    const staying = source.lease();
    leaving.get(0);
    const page = staying.get(0);
    const unleased = source.lease();
    unleased.release();

    leaving.release();
    expect(calls[0].signal.aborted).toBe(false);
    calls[0].resolve();

    await expect(page).resolves.toEqual({ key: 0, ids: ["0"] });
    expect(source.peek(0)).toEqual({ key: 0, ids: ["0"] });
  });

  test("a lease continuing another keeps the fetches it had in flight", async () => {
    const { calls, fetch } = gated();
    const source = createPageSource(fetch);
    const replaced = source.lease();
    replaced.get(0);
    const replacing = source.lease(replaced);

    replaced.release();
    expect(calls[0].signal.aborted).toBe(false);
    calls[0].resolve();
    await Promise.resolve();

    expect(replacing.peek(0)).toEqual({ key: 0, ids: ["0"] });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test("an unleased read is never cancelled", async () => {
    const { calls, fetch } = gated();
    const source = createPageSource(fetch);
    const lease = source.lease();
    lease.get(0);
    const page = source.get(0);

    lease.release();
    calls[0].resolve();

    await expect(page).resolves.toEqual({ key: 0, ids: ["0"] });
  });

  test("a burst of jumps keeps only the latest jump's pages", async () => {
    const { calls, drain, fetch } = gated();
    const source = createPageSource(fetch, { concurrency: 4 });
    let most = 0;
    let lease: ReturnType<typeof source.lease> | undefined;
    // each jump reads six pages around its target, superseding the last
    for (const target of [100, 300, 50, 700, 20, 900, 400]) {
      lease?.release();
      lease = source.lease();
      for (let key = target - 2; key <= target + 3; key++) lease.get(key);
      most = Math.max(most, source.active);
    }
    await drain();

    expect(most).toBeLessThanOrEqual(4);
    const sent = fetch.mock.calls.map(([key]) => key);
    const kept = [398, 399, 400, 401, 402, 403];
    // superseded pages were either never sent or aborted
    for (const call of fetch.mock.calls) {
      const [key, signal] = call;
      if (!kept.includes(key)) expect(signal.aborted).toBe(true);
    }
    // each superseded jump sent only the four that could run
    expect(sent).toHaveLength(6 * 4 + 6);
    // what is left unanswered was aborted
    expect(calls.every((call) => call.signal.aborted)).toBe(true);
    for (const key of sent) {
      expect(source.peek(key) !== undefined).toBe(kept.includes(key));
    }
    expect(source.size).toBe(6);
  });
});

describe("bounds", () => {
  test("the default capacity is counted in samples", () => {
    expect(PAGE_CAPACITY * PAGE_SIZE).toBe(CACHED_ITEMS);
    expect(Number.isInteger(PAGE_CAPACITY)).toBe(true);
  });
});

describe("warming", () => {
  const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
  };

  test("runs one warm at a time, and only while two slots are free", () => {
    const { fetch } = gated();
    const source = createPageSource(fetch, { concurrency: 4 });
    const lease = source.lease();
    lease.get(0);
    lease.get(1);

    source.warm(2);
    source.warm(3);
    expect(fetch.mock.calls.map(([key]) => key)).toEqual([0, 1, 2]);

    lease.get(4);
    source.warm(5);
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  test("a warm is never queued, and never shows as fetching", () => {
    const { fetch } = gated();
    const source = createPageSource(fetch, { concurrency: 2 });

    source.warm(0);
    expect(source.active).toBe(1);
    expect(source.fetching).toBe(false);

    source.warm(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test("a leased read that finds no free slot aborts the warm for it", async () => {
    const { calls, fetch } = gated();
    const source = createPageSource(fetch, { concurrency: 3 });
    const lease = source.lease();
    lease.get(0);
    source.warm(1);
    lease.get(2);

    expect(source.active).toBe(3);
    const page = lease.get(3);
    expect(calls[1].signal.aborted).toBe(true);
    expect(fetch.mock.calls.map(([key]) => key)).toEqual([0, 1, 2, 3]);

    calls[3].resolve();
    await expect(page).resolves.toEqual({ key: 3, ids: ["3"] });
    expect(source.peek(1)).toBeUndefined();
  });

  test("a read promotes a warm in flight, which no read aborts after", async () => {
    const { calls, fetch } = gated();
    const source = createPageSource(fetch, { concurrency: 3 });
    const lease = source.lease();
    lease.get(0);
    source.warm(1);

    const page = lease.get(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(source.fetching).toBe(true);
    lease.get(2);
    lease.get(3);
    expect(calls[1].signal.aborted).toBe(false);

    calls[1].resolve();
    await expect(page).resolves.toEqual({ key: 1, ids: ["1"] });
  });

  test("a resolved warm is read from memory", async () => {
    const { calls, fetch } = gated();
    const source = createPageSource(fetch);
    source.warm(1);
    calls[0].resolve();
    await flush();

    const lease = source.lease();
    expect(lease.peek(1)).toEqual({ key: 1, ids: ["1"] });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test(`keeps at most ${MAX_WARMED} warms unread, dropping the oldest`, async () => {
    const { calls, fetch } = gated();
    const onEvict = vi.fn();
    const source = createPageSource(fetch, { onEvict });
    for (const key of [1, 2, 3]) {
      source.warm(key);
      calls[calls.length - 1].resolve();
      await flush();
    }

    expect(onEvict.mock.calls.map(([key]) => key)).toEqual([1]);
    expect(source.peek(1)).toBeUndefined();
    expect(source.size).toBe(MAX_WARMED);
  });

  test("an unread warm is the first page evicted", async () => {
    const { calls, fetch } = gated();
    const onEvict = vi.fn();
    const source = createPageSource(fetch, { capacity: 2, onEvict });
    await Promise.all(
      [0, 1].map((key) => {
        const page = source.get(key);
        calls[key].resolve();
        return page;
      }),
    );
    source.warm(2);
    calls[2].resolve();
    await flush();

    expect(onEvict.mock.calls.map(([key]) => key)).toEqual([2]);
    expect(source.peek(0)).toBeDefined();
    expect(source.peek(1)).toBeDefined();
  });

  test("dispose and invalidate abort warms in flight", () => {
    const { calls, fetch } = gated();
    const source = createPageSource(fetch);
    source.warm(0);
    source.dispose();
    expect(calls[0].signal.aborted).toBe(true);
    expect(source.active).toBe(0);

    source.warm(1);
    source.invalidate();
    expect(calls[1].signal.aborted).toBe(true);
    expect(source.active).toBe(0);
  });
});
