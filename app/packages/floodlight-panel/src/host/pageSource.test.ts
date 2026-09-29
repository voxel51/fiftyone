import { describe, expect, test, vi } from "vitest";
import { createPageSource } from "./pageSource";

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
