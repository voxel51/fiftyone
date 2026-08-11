import { LRUCache } from "lru-cache";
import { describe, expect, it, vi } from "vitest";
import { memoizedRead } from "./memoized-read";

describe("memoized read", () => {
  it("shares hits and retries a rejected load", async () => {
    const cache = new LRUCache<string, Promise<number>>({ max: 2 });
    const load = vi
      .fn<() => Promise<number>>()
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce(2);

    const rejected = memoizedRead<number>(cache, "key", load);
    expect(memoizedRead<number>(cache, "key", load)).toBe(rejected);
    await expect(rejected).rejects.toThrow("temporary");
    await expect(memoizedRead<number>(cache, "key", load)).resolves.toBe(2);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("does not let an evicted rejection delete a newer read", async () => {
    const cache = new LRUCache<string, Promise<number>>({ max: 1 });
    let rejectOld: ((error: Error) => void) | undefined;
    const old = memoizedRead<number>(
      cache,
      "same",
      () =>
        new Promise<number>((_resolve, reject) => {
          rejectOld = reject;
        }),
    );
    await memoizedRead<number>(cache, "other", () => Promise.resolve(1));
    const replacement = memoizedRead<number>(cache, "same", () =>
      Promise.resolve(2),
    );

    rejectOld?.(new Error("old failure"));
    await expect(old).rejects.toThrow("old failure");
    expect(cache.get("same")).toBe(replacement);
    await expect(replacement).resolves.toBe(2);
  });
});
