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
