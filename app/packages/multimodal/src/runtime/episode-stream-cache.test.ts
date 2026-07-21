import { describe, expect, it, vi } from "vitest";
import type { DecodedFrame } from "../ir";
import { EpisodeStreamCache } from "./episode-stream-cache";

const MESSAGE = {
  output: { resourceHints: { sizeBytes: 128 } },
  streamId: "stream",
  timestampNs: 1n,
} satisfies DecodedFrame;

describe("EpisodeStreamCache", () => {
  it("publishes revision changes when cached tick contents change", () => {
    const cache = new EpisodeStreamCache();
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
    const cache = new EpisodeStreamCache();
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
    const cache = new EpisodeStreamCache();
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
    const cache = new EpisodeStreamCache();
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
    const cache = new EpisodeStreamCache();
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
    const cache = new EpisodeStreamCache(2);

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

  it("counts one decoded message once across multiple tick placements", () => {
    const cache = new EpisodeStreamCache();

    cache.set(1n, MESSAGE);
    cache.set(2n, MESSAGE);
    cache.set(3n, MESSAGE, { pinned: true });

    expect(cache.stats()).toEqual({
      decodedBytes: 128,
      entryCount: 2,
      pinnedEntryCount: 1,
    });

    cache.pruneOutside(3n, 3n);
    expect(cache.stats().decodedBytes).toBe(128);

    cache.clearPinned();
    expect(cache.stats()).toEqual({
      decodedBytes: 0,
      entryCount: 0,
      pinnedEntryCount: 0,
    });
  });

  it("releases unique decoded bytes on replacement, LRU eviction, and clear", () => {
    const cache = new EpisodeStreamCache(1);
    const second = {
      ...MESSAGE,
      output: {
        ...MESSAGE.output,
        resourceHints: { sizeBytes: 256 },
      },
    };

    cache.set(1n, MESSAGE);
    expect(cache.stats().decodedBytes).toBe(128);

    cache.set(2n, second);
    expect(cache.stats()).toEqual({
      decodedBytes: 256,
      entryCount: 1,
      pinnedEntryCount: 0,
    });

    cache.set(2n, MESSAGE);
    expect(cache.stats().decodedBytes).toBe(128);

    cache.clear();
    expect(cache.stats().decodedBytes).toBe(0);
  });

  it("prunes ordinary placements outside a protected runway", () => {
    const cache = new EpisodeStreamCache();
    cache.set(1n, MESSAGE);
    cache.set(2n, MESSAGE);
    cache.set(3n, MESSAGE);
    cache.set(4n, MESSAGE, { pinned: true });

    expect(cache.pruneOutside(2n, 3n)).toBe(1);
    expect(cache.has(1n)).toBe(false);
    expect(cache.has(2n)).toBe(true);
    expect(cache.has(3n)).toBe(true);
    expect(cache.has(4n)).toBe(true);
    expect(cache.stats().decodedBytes).toBe(128);
  });
});
