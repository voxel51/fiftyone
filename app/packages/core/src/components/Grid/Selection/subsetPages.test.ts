import { describe, expect, it, vi } from "vitest";
import { SubsetPages } from "./subsetPages";

const page = { subsets: [], total: 0, count: 0 };

describe("subset metadata pages", () => {
  it("shares pending requests and reuses metadata until the revision changes", async () => {
    const cache = new SubsetPages();
    const load = vi.fn(async () => page);
    const first = cache.get("dataset:0", load);
    expect(cache.get("dataset:0", load)).toBe(first);
    await first;
    expect(cache.peek("dataset:0")).toBe(page);
    await cache.get("dataset:0", load);
    expect(load).toHaveBeenCalledOnce();
    await cache.get("dataset:1", load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("retries failures and supports explicit reloads and expiry", async () => {
    const cache = new SubsetPages();
    const clock = vi.spyOn(Date, "now").mockReturnValue(0);
    try {
      const load = vi
        .fn()
        .mockRejectedValueOnce(Error("offline"))
        .mockResolvedValue(page);
      await expect(cache.get("key", load)).rejects.toThrow("offline");
      await cache.get("key", load);
      await cache.get("key", load, true);
      expect(load).toHaveBeenCalledTimes(3);
      clock.mockReturnValue(30_001);
      expect(cache.peek("key")).toBeUndefined();
      await cache.get("key", load);
      expect(load).toHaveBeenCalledTimes(4);
    } finally {
      clock.mockRestore();
    }
  });
});
