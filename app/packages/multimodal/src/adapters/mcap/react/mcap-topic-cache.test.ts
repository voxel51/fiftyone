import { describe, expect, it, vi } from "vitest";
import type { McapDecodedMessage } from "../types";
import { McapTopicCache } from "./mcap-topic-cache";

const MESSAGE = {
  decoded: { output: { visualization: null } },
} as unknown as McapDecodedMessage;

describe("McapTopicCache", () => {
  it("publishes revision changes when cached tick contents change", () => {
    const cache = new McapTopicCache();
    const listener = vi.fn();
    const unsubscribe = cache.subscribeToChanges(listener);

    cache.set(1n, MESSAGE);
    expect(cache.revision).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);

    cache.set(1n, MESSAGE);
    expect(cache.revision).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);

    cache.set(1n, null);
    expect(cache.revision).toBe(2);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    cache.set(2n, MESSAGE);
    expect(cache.revision).toBe(3);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("bumps revision when a distinct message replaces the same tick", () => {
    const cache = new McapTopicCache();
    const listener = vi.fn();
    cache.subscribeToChanges(listener);

    cache.set(1n, MESSAGE);
    expect(cache.revision).toBe(1);

    // A new object with equivalent contents for the same tick is the path that
    // drives re-renders during re-fetch — identity differs from the cached
    // entry, so it must bump even though an entry already exists.
    cache.set(1n, { ...MESSAGE });
    expect(cache.revision).toBe(2);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("publishes when clear removes cached entries", () => {
    const cache = new McapTopicCache();
    const listener = vi.fn();
    cache.subscribeToChanges(listener);

    cache.clear();
    expect(cache.revision).toBe(0);
    expect(listener).not.toHaveBeenCalled();

    cache.set(1n, MESSAGE);
    cache.clear();

    expect(cache.revision).toBe(2);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("clears and publishes when the final active subscriber leaves", () => {
    const cache = new McapTopicCache();
    const listener = vi.fn();
    cache.subscribeToChanges(listener);

    const release = cache.subscribe();
    cache.set(1n, MESSAGE);
    release();

    expect(cache.revision).toBe(2);
    expect(cache.get(1n)).toBeUndefined();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("guards against a double release clearing the cache while another subscriber is active", () => {
    const cache = new McapTopicCache();
    const releaseA = cache.subscribe();
    const releaseB = cache.subscribe();
    expect(cache.isActive).toBe(true);

    releaseA();
    // StrictMode can fire the same cleanup twice; the second call must be a
    // no-op rather than decrementing again (which would drop to 0 and clear
    // while releaseB still holds the cache).
    releaseA();
    expect(cache.isActive).toBe(true);

    releaseB();
    expect(cache.isActive).toBe(false);
  });

  it("keeps pinned runway entries outside normal LRU churn", () => {
    const cache = new McapTopicCache(2);

    cache.set(0n, null, { pinned: true });
    cache.set(1n, null);
    cache.set(2n, null);
    cache.set(3n, null);

    expect(cache.has(0n)).toBe(true);
    expect(cache.get(0n)).toBeNull();
    expect(cache.has(1n)).toBe(false);

    cache.clearPinned();

    expect(cache.has(0n)).toBe(false);
  });
});
